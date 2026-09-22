/**
 * Chat Panel Component
 * Handles AI chat with streaming, markdown rendering, and code snippets
 */

import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useSession } from '../contexts/SessionContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logMessage, logConsole, logInteraction } from '../services/dataLogger';
import { streamChatCompletionWithBudget, streamTutorCompletion } from '../utils/chatStream';
import { getUserAccessLevel, getDailyBudgetUsage } from '../services/aiUsage';
import { fetchModelMetadata, pickInitialModel } from '../services/aiModels';
import instance from '../config/instance';
import { 
  LEVEL_INSTRUCTION_PREFIX,
  beginnerPrompt,
  intermediatePrompt,
  experiencedPrompt,
} from '../prompts/codingLevels';
import CodeModal from './CodeModal';
import ConsoleModal from './ConsoleModal';
import BudgetErrorModal from './BudgetErrorModal';
import ChatConfiguration from './ChatConfiguration';
import ChatTabs from './ChatTabs';
import './ChatPanel.css';

// Configure marked for better markdown rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// System directive appended in direct chat mode when the UI language is not
// English, so the model answers (and comments code) in the student's language.
const RESPONSE_LANGUAGE_DIRECTIVES = {
  da: 'Respond in Danish. Write code comments in Danish, but keep code identifiers and API names unchanged.',
};

// Chat mode from the instance config: 'direct' keeps the original
// client-primed budget endpoint; 'tutor' sends raw fields to the server-side
// tutor pipeline (prompts assembled server-side, no model picker).
const TUTOR_MODE = instance.chat.mode === 'tutor';

// Logged as ai_model on tutor-pipeline assistant messages (no selectedModel).
const TUTOR_AI_MODEL = 'tutor-pipeline';

// Budget/usage UI and its Supabase reads are per-instance.
const SHOW_BUDGET_UI = Boolean(instance.chat.showBudgetUI);

const EMPTY_MODEL_METADATA = {
  rows: [],
  allModels: [],
  modelsByProvider: {},
  streamableByModel: {},
  unlimitedByModel: {},
  defaultModels: [],
  premiumModels: [],
  nonPremiumModels: [],
};

const ChatPanel = ({ onReplaceCode, getCodeContent, getConsoleContent }) => {
  const { 
    activeSession, 
    conversationHistory,
    conversations,
    currentConversationId,
    getSystemPriming,
    switchConversation,
    createNewConversation,
    updateConversationName,
    createSnapshot,
    activePlatform,
  } = useSession();
  const { t, lang } = useLanguage();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [codingLevel, setCodingLevel] = useState('beginner');
  const [modelMetadata, setModelMetadata] = useState(EMPTY_MODEL_METADATA);
  const [selectedModel, setSelectedModel] = useState('');
  const [dailyUsagePercentage, setDailyUsagePercentage] = useState(0);
  const [dailyUsageLoading, setDailyUsageLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState(null);
  const [attachedContext, setAttachedContext] = useState({ includeCode: false, includeConsole: false });
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [currentCodeSnippet, setCurrentCodeSnippet] = useState({ code: '', lang: '' });
  const [consoleModalOpen, setConsoleModalOpen] = useState(false);
  const [currentConsoleContent, setCurrentConsoleContent] = useState('');
  const [consoleHasContent, setConsoleHasContent] = useState(false);
  const [budgetErrorVisible, setBudgetErrorVisible] = useState(false);
  const [userAccessLevel, setUserAccessLevel] = useState('standard');

  const selectedModelStreaming = modelMetadata.streamableByModel[selectedModel] ?? false;

  const chatBodyRef = useRef(null);
  const streamingMessageRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const currentConversationIdRef = useRef(currentConversationId);
  const warnedNoTutorHwModeRef = useRef(false);

  // Startup sanity check: tutor mode needs a platform with a tutorHwMode.
  useEffect(() => {
    if (!TUTOR_MODE || warnedNoTutorHwModeRef.current) return;
    if (activePlatform && !activePlatform.tutorHwMode) {
      warnedNoTutorHwModeRef.current = true;
      console.warn(
        `Tutor chat mode: active platform "${activePlatform.id}" has no tutorHwMode; tutor requests will be rejected.`
      );
    }
  }, [activePlatform]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Load conversation history from session
  useEffect(() => {
    if (conversationHistory && conversationHistory.length > 0) {
      // Filter out system messages for display
      const displayMessages = conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'bot',
          content: msg.content,
          messageId: msg.id,
        }));
      setMessages(displayMessages);
      
    } else {
      setMessages([]);
    }
  }, [conversationHistory]);

  // Scroll to bottom when messages change, but only if the user is already near the bottom
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  // Track whether the user is scrolled near the bottom so we know whether to auto-scroll
  const handleChatScroll = () => {
    const el = chatBodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 50;
  };

  // Check console content availability on mount / when the accessor changes
  useEffect(() => {
    const checkConsole = async () => {
      if (getConsoleContent) {
        const content = await getConsoleContent();
        setConsoleHasContent(content && content.trim().length > 0);
      }
    };
    checkConsole();
  }, [getConsoleContent]);

  // React immediately to console buffer changes from the editor (device
  // connect/disconnect, output, clear) so the "Add Console to Chat" button
  // enables/disables without needing a tab switch to force a re-render.
  useEffect(() => {
    const handler = (e) => {
      setConsoleHasContent(!!e.detail?.hasContent);
    };
    window.addEventListener('console-content-changed', handler);
    return () => window.removeEventListener('console-content-changed', handler);
  }, []);

  // Fetch user access level (budget instances only)
  useEffect(() => {
    if (!SHOW_BUDGET_UI) return;
    const fetchAccessLevel = async () => {
      try {
        const level = await getUserAccessLevel();
        setUserAccessLevel(level);
      } catch (err) {
        console.error('Error fetching access level:', err);
      }
    };
    fetchAccessLevel();
  }, []);

  // Fetch model metadata from database (direct mode only — the tutor
  // pipeline has no model picker, so skip the Supabase call entirely)
  useEffect(() => {
    if (TUTOR_MODE) return;
    const loadModelMetadata = async () => {
      try {
        const metadata = await fetchModelMetadata();
        setModelMetadata(metadata);
      } catch (error) {
        console.error('Unable to load AI model metadata:', error);
        setModelMetadata(EMPTY_MODEL_METADATA);
      }
    };
    loadModelMetadata();
  }, []);

  // Keep selected model valid as available models change
  useEffect(() => {
    const allModels = modelMetadata.allModels || [];
    if (!selectedModel && allModels.length > 0) {
      setSelectedModel(pickInitialModel(modelMetadata));
      return;
    }
    if (selectedModel && !allModels.includes(selectedModel)) {
      setSelectedModel(pickInitialModel(modelMetadata));
    }
  }, [modelMetadata, selectedModel]);

  const refreshDailyUsage = async () => {
    if (!SHOW_BUDGET_UI || !userAccessLevel) return;

    setDailyUsageLoading(true);
    try {
      const usage = await getDailyBudgetUsage(userAccessLevel);
      setDailyUsagePercentage(usage.percentage);
    } catch (error) {
      console.error('Error fetching daily usage percentage:', error);
      setDailyUsagePercentage(0);
    } finally {
      setDailyUsageLoading(false);
    }
  };

  useEffect(() => {
    refreshDailyUsage();
  }, [userAccessLevel]);

  const handleModelChange = (model) => {
    if (activeSession?.id) {
      logInteraction(`switch_model_${model}`, activeSession.id);
    }
    setSelectedModel(model);
  };

  const scrollToBottom = () => {
    if (chatBodyRef.current) {
      requestAnimationFrame(() => {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  };

  const getLevelPrompt = (level) => {
    switch (level) {
      case 'beginner':
        return beginnerPrompt;
      case 'intermediate':
        return intermediatePrompt;
      case 'experienced':
        return experiencedPrompt;
      default:
        return beginnerPrompt;
    }
  };

  /**
   * Extract Python code snippets from message content
   * Returns array of { code, key } objects
   * @param {string} content - The message content
   * @param {string} messageId - The database message ID (used for consistent keys)
   */
  const extractPythonSnippets = (content, messageId) => {
    const snippets = [];
    
    // Split by console blocks first (4 backticks)
    const consoleSegments = content.split(/````([\s\S]*?)````/g);
    
    consoleSegments.forEach((consoleSeg, consoleIdx) => {
      if (consoleIdx % 2 === 0) {
        // Not a console block, check for code blocks (3 backticks)
        const codeBlocks = consoleSeg.split(/```([\s\S]*?)```/g);
        
        for (let i = 1; i < codeBlocks.length; i += 2) {
          const block = codeBlocks[i];
          let codeText = block;
          let lang = '';
          
          const firstNL = block.indexOf('\n');
          if (firstNL !== -1) {
            const firstLine = block.slice(0, firstNL).trim();
            if (/^[a-zA-Z0-9+#-]+$/.test(firstLine)) {
              lang = firstLine;
              codeText = block.slice(firstNL + 1);
            }
          }
          
          const isPython = lang === 'python' || lang === 'py';
          if (isPython && codeText.trim()) {
            // Use messageId and match the rendering key format
            const key = `msg-${messageId}-${consoleIdx}-${i}`;
            snippets.push({ code: codeText, key });
          }
        }
      }
    });
    
    return snippets;
  };

  const handleSendMessage = async () => {
    if (!activeSession) {
      alert(t('noActiveSession'));
      return;
    }
    if (TUTOR_MODE && !activePlatform?.tutorHwMode) {
      // Platform has no tutor pipeline support — surface an error in chat
      // instead of calling the endpoint.
      setMessages(prev => [...prev, { role: 'bot', content: t('tutorPlatformUnsupported') }]);
      return;
    }
    if (!TUTOR_MODE && !selectedModel) {
      alert(t('noModelAvailable'));
      return;
    }

    let text = inputText.trim();
    if (!text && !attachedContext.includeCode && !attachedContext.includeConsole) {
      return;
    }

    // Fetch context at send time
    let codeContextId = null;
    const finalContext = { code: null, console: null };
    if (attachedContext.includeCode && getCodeContent) {
      finalContext.code = await getCodeContent();
      // Snapshot the code as it was at send time and link the message to that
      // immutable snapshot (messages.code_context_id -> code_snapshots.id).
      // Referencing the mutable code record would make every message point at
      // the same row whose content keeps changing.
      const snapshotId = await createSnapshot('chat_context');
      codeContextId = typeof snapshotId === 'number' && snapshotId > 0 ? snapshotId : null;
    }
    if (attachedContext.includeConsole && getConsoleContent) {
      finalContext.console = await getConsoleContent();
    }

    // Raw user text before code/console wrapping — the tutor pipeline stacks
    // code/console itself, so user_msg must stay unwrapped.
    const rawText = text;

    // Build display message with wrapped code and console
    if (finalContext.code) {
      const fenceLang = activePlatform?.editorLanguage || 'python';
      text += '\n```' + fenceLang + '\n' + finalContext.code + '\n```';
    }
    if (finalContext.console) {
      text += '\n````\n' + finalContext.console + '\n````';
    }

    // Add user message to UI — always scroll to bottom on send
    stickToBottomRef.current = true;
    if (text.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: text }]);
    }

    setInputText('');
    setAttachedContext({ includeCode: false, includeConsole: false });

    // Log context to database
    const sessionId = activeSession.id;
    const conversationId = currentConversationId;
    let consoleContextId = null;

    await logInteraction('send_message', sessionId);

    if (finalContext.console && finalContext.console.trim()) {
      consoleContextId = await logConsole(finalContext.console, sessionId, 'chat_context');
    }

    // Log user message
    if (text) {
      await logMessage({
        conversation_id: conversationId,
        role: 'user',
        content: text,
        coding_level: codingLevel,
        code_context_id: codeContextId,
        console_context_id: consoleContextId,
        lang,
      });
    }

    // Tutor mode: the server-side pipeline owns prompt assembly. Send raw
    // fields (history/user_msg/hw_mode/level/lang + optional code/console)
    // and render progress events as a thinking trace on the bot message.
    if (TUTOR_MODE) {
      // history = prior turns only (messages state before this send; the
      // current user message is carried separately in user_msg).
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      const payload = {
        history,
        user_msg: rawText || 'Please analyze the provided context.',
        hw_mode: activePlatform.tutorHwMode,
        level: codingLevel,
        lang,
      };
      if (finalContext.code && finalContext.code.trim()) {
        payload.code = finalContext.code;
      }
      if (finalContext.console && finalContext.console.trim()) {
        payload.console = finalContext.console;
      }

      setIsStreaming(true);
      setStreamingConversationId(conversationId);
      streamingMessageRef.current = '';

      // Patch the streaming bot message in place; skipped when the user has
      // switched to a different conversation tab (mirrors the direct path).
      const updateLast = (patch) => {
        if (currentConversationIdRef.current !== conversationId) return;
        setMessages(prev => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], ...patch };
          return next;
        });
      };

      let fullResponse = '';
      const thinking = [];

      try {
        // Insert a placeholder bot message immediately so the thinking trace
        // is visible while progress events arrive (before the first token).
        setMessages(prev => [...prev, { role: 'bot', content: '', thinking: [], streaming: true }]);

        for await (const event of streamTutorCompletion(payload)) {
          if (event.type === 'progress') {
            thinking.push({ stage: event.stage, status: event.status, payload: event.payload || {} });
            updateLast({ thinking: [...thinking] });
          } else if (event.type === 'content') {
            fullResponse += event.content;
            streamingMessageRef.current = fullResponse;
            updateLast({ content: fullResponse });
          }
        }

        // Finalize message
        updateLast({ content: fullResponse, thinking: [...thinking], streaming: false });

        // Log assistant message. Tokens are always null here: the tutor
        // pipeline makes several real LLM calls per turn but never reports
        // usage back to the client, so `0` would falsely read as "measured
        // and free" rather than "not measured."
        await logMessage({
          conversation_id: conversationId,
          role: 'assistant',
          content: fullResponse,
          coding_level: codingLevel,
          ai_model: TUTOR_AI_MODEL,
          prompt_tokens: null,
          completion_tokens: null,
          lang,
        });
      } catch (error) {
        console.error('Streaming error:', error);
        updateLast({ content: `${t('errorPrefix')}${error.message}`, streaming: false });

        // Log whatever we have so a failed/interrupted turn leaves a trace
        // instead of an orphaned user question with no reply on record.
        await logMessage({
          conversation_id: conversationId,
          role: 'assistant',
          content: fullResponse || `[No response — request failed: ${error.message}]`,
          coding_level: codingLevel,
          ai_model: TUTOR_AI_MODEL,
          prompt_tokens: null,
          completion_tokens: null,
          lang,
        });
      } finally {
        setIsStreaming(false);
        setStreamingConversationId(null);
        streamingMessageRef.current = null;
      }
      return;
    }

    // Build conversation for AI. Collected as a list first (rather than
    // pushed straight into `conversation`) so the exact same pieces can also
    // be logged below — one source of truth for what's sent vs. what's saved.
    const systemPieces = [getSystemPriming()];

    // Add coding level instructions
    const levelInstructions = getLevelPrompt(codingLevel);
    if (levelInstructions) {
      systemPieces.push(`${LEVEL_INSTRUCTION_PREFIX}\n\n${levelInstructions}`);
    }

    // Answer in the UI language (priming/level prompts stay English —
    // instruction-following is better with English system prompts).
    if (lang && lang !== 'en') {
      systemPieces.push(RESPONSE_LANGUAGE_DIRECTIVES[lang] || RESPONSE_LANGUAGE_DIRECTIVES.da);
    }

    // Log the exact system priming the first time it's established for this
    // conversation, so the instructions actually in effect for this and
    // later turns are reconstructable later instead of only inferable from
    // coding_level/ai_model on the surrounding messages.
    if (messages.length === 0) {
      await logMessage({
        conversation_id: conversationId,
        role: 'system',
        content: systemPieces.join('\n\n---\n\n'),
        coding_level: codingLevel,
        lang,
      });
    }

    const conversation = [];
    systemPieces.forEach((content) => {
      conversation.push({ role: 'system', content });
    });

    // Add conversation history
    messages.forEach(msg => {
      conversation.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    });

    // Build context string
    let contextStr = '';
    if (finalContext.code && finalContext.code.trim()) {
      contextStr += `The user has provided the following code for context:\n--- START OF CODE ---\n${finalContext.code}\n--- END OF CODE ---\n\n`;
    }
    if (finalContext.console && finalContext.console.trim()) {
      contextStr += `The user has provided the following console output for context:\n--- START OF CONSOLE OUTPUT ---\n${finalContext.console}\n--- END OF CONSOLE OUTPUT ---\n\n`;
    }

    const userPrompt = text || 'Please analyze the provided context.';
    const fullPrompt = `${contextStr}User question: ${userPrompt}`;

    conversation.push({
      role: 'user',
      content: fullPrompt,
    });

    // Stream response
    setIsStreaming(true);
    setStreamingConversationId(conversationId);
    streamingMessageRef.current = '';
    let isFirstChunk = true;

    // Determine which model to use
    const actualModel = selectedModel;
    // Hoisted above the try so the catch block can still log whatever
    // streamed successfully before an interruption/error, instead of the
    // whole assistant turn vanishing with no trace.
    let fullResponse = '';
    let budgetStatus = null;
    let usageData = null;

    try {
      for await (const event of streamChatCompletionWithBudget(conversation, actualModel)) {
        if (event.type === 'content') {
          fullResponse += event.content;
          streamingMessageRef.current = fullResponse;

          // Skip UI updates if the user has switched to a different conversation tab
          if (currentConversationIdRef.current !== conversationId) {
            continue;
          }

          if (isFirstChunk) {
            // Add bot message only when first chunk arrives
            isFirstChunk = false;
            setMessages(prev => [...prev, { role: 'bot', content: fullResponse, streaming: true }]);
          } else {
            // Update last message
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                role: 'bot',
                content: fullResponse,
                streaming: true,
              };
              return newMessages;
            });
          }
        } else if (event.type === 'usage_logged') {
          // Capture usage data from the usage_logged event
          usageData = event.usage;
        } else if (event.type === 'budget_status') {
          // Legacy support for budget_status events
          budgetStatus = event;
          usageData = event.usage;
        }
      }

      // Finalize message (only if user is still on the originating tab)
      if (currentConversationIdRef.current === conversationId) {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: 'bot',
            content: fullResponse,
            streaming: false,
          };
          return newMessages;
        });
      }

      // Log assistant message. Tokens are null (not 0) when the provider
      // never reported usage (e.g. SkoleGPT, or a swallowed backend logging
      // error) — 0 would falsely read as "measured and free."
      await logMessage({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse,
        coding_level: codingLevel,
        ai_model: actualModel,
        prompt_tokens: usageData?.input_tokens ?? null,
        completion_tokens: usageData?.output_tokens ?? null,
        lang,
      });

      // Check budget status and show modal if budget exceeded
      if (budgetStatus && !budgetStatus.has_budget) {
        setBudgetErrorVisible(true);
      }

    } catch (error) {
      console.error('Streaming error:', error);

      // Check if this is a budget error
      const isBudgetError = error.message && error.message.includes('exceeded their budget');

      if (isBudgetError) {
        // Show budget error modal, don't add any bot message
        setBudgetErrorVisible(true);
      } else {
        // For other errors, show error message only if we started streaming
        // and the user is still on the originating tab
        if (!isFirstChunk && currentConversationIdRef.current === conversationId) {
          // We added a bot message, update it with the error
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'bot',
              content: `${t('errorPrefix')}${error.message}`,
              streaming: false,
            };
            return newMessages;
          });
        }
        // If we didn't start streaming yet, don't add any error message
      }

      // Log whatever we have so a failed/interrupted turn leaves a trace
      // instead of an orphaned user question with no reply on record.
      await logMessage({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse || `[No response — ${isBudgetError ? 'blocked: daily budget exceeded' : `request failed: ${error.message}`}]`,
        coding_level: codingLevel,
        ai_model: actualModel,
        prompt_tokens: null,
        completion_tokens: null,
        lang,
      });
    } finally {
      setIsStreaming(false);
      setStreamingConversationId(null);
      streamingMessageRef.current = null;
      await refreshDailyUsage();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: allow default (newline)
      } else {
        // Enter: send message
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  const openCodeModal = (code, lang) => {
    setCurrentCodeSnippet({ code, lang });
    setCodeModalOpen(true);
  };

  const closeCodeModal = () => {
    setCodeModalOpen(false);
    setCurrentCodeSnippet({ code: '', lang: '' });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCodeSnippet.code);
    if (activeSession?.id) {
      logInteraction('copy_ai_code', activeSession.id);
    }
    closeCodeModal();
  };

  const handleReplaceCode = () => {
    if (onReplaceCode) {
      onReplaceCode(currentCodeSnippet.code);
    }
    closeCodeModal();
  };

  const openConsoleModal = (consoleContent) => {
    setCurrentConsoleContent(consoleContent);
    setConsoleModalOpen(true);
  };

  const closeConsoleModal = () => {
    setConsoleModalOpen(false);
    setCurrentConsoleContent('');
  };

  const handleCopyConsole = () => {
    navigator.clipboard.writeText(currentConsoleContent);
    closeConsoleModal();
  };

  // Collapsible tutor-pipeline thinking trace (progress events). Open while
  // streaming, collapsed once the answer is complete. No-op in direct mode
  // (messages never carry a thinking array there).
  const renderThinkingTrace = (thinking, streaming) => {
    if (!thinking || thinking.length === 0) return null;
    const labels = {
      summarize: t('thinkingSummarize'),
      doc_routing: t('thinkingDocRouting'),
      outline: t('thinkingOutline'),
    };
    return (
      <details className="chat-thinking" open={streaming}>
        <summary>
          {streaming ? t('thinkingInProgress') : t('thinkingDone')} ({thinking.length} {t('thinkingSteps')})
        </summary>
        <ul className="chat-thinking-steps">
          {thinking.map((step, idx) => {
            const label = labels[step.stage] || step.stage;
            const p = step.payload || {};
            let detail = null;
            if (step.stage === 'summarize') {
              detail = p.summarized
                ? t('thinkingSummarized')
                    .replace('{before}', p.before_tokens)
                    .replace('{after}', p.after_tokens)
                : t('thinkingNotSummarized');
            } else if (step.stage === 'doc_routing' && Array.isArray(p.bundles)) {
              detail = p.bundles.length
                ? t('thinkingDocsLabel').replace('{bundles}', p.bundles.join(', '))
                : t('thinkingDocsNone');
            } else if (step.stage === 'outline' && p.outline) {
              detail = p.outline;
            }
            return (
              <li key={idx}>
                <strong>{label}</strong>
                {detail && (
                  <div className="chat-thinking-detail">{detail}</div>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    );
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const label = isUser ? t('userLabel') : message.role === 'system' ? 'System' : t('botLabel');
    const color = isUser ? '#fbe2d7' : message.role === 'system' ? '#d7e4fb' : '#d8f6d8';
    const align = isUser ? 'align-right' : 'align-left';

    // Use messageId from database for consistent keys, fallback to index for display
    const messageKey = message.messageId || index;

    // First split by console blocks (4 backticks)
    const consoleSegments = message.content.split(/````([\s\S]*?)````/g);

    return (
      <div key={index} className={`chat-msg-wrap ${align}`}>
        <div className="chat-label">{label}</div>
        <div className="chat-bubble" style={{ backgroundColor: color }}>
          {!isUser && renderThinkingTrace(message.thinking, message.streaming)}
          {consoleSegments.map((consoleSeg, consoleIdx) => {
            if (consoleIdx % 2 === 1) {
              // This is a console block
              const consoleText = consoleSeg.trim();
              return (
                <button
                  key={consoleIdx}
                  className="console-btn"
                  onClick={() => openConsoleModal(consoleText)}
                >
                  {t('viewConsoleLog')}
                </button>
              );
            } else {
              // Not a console block, check for code blocks (3 backticks)
              const codeSegments = consoleSeg.split(/```([\s\S]*?)```/g);
              
              return codeSegments.map((codeSeg, codeIdx) => {
                if (codeIdx % 2 === 0) {
                  // Markdown text
                  if (codeSeg.trim()) {
                    const html = DOMPurify.sanitize(marked.parse(codeSeg, { async: false }));
                    return (
                      <div 
                        key={`${consoleIdx}-${codeIdx}`} 
                        className="markdown-content"
                        dangerouslySetInnerHTML={{ __html: html }} 
                      />
                    );
                  }
                } else {
                  // Code block
                  let codeText = codeSeg;
                  let lang = '';
                  const firstNL = codeSeg.indexOf('\n');
                  if (firstNL !== -1) {
                    const firstLine = codeSeg.slice(0, firstNL).trim();
                    if (/^[a-zA-Z0-9+#-]+$/.test(firstLine)) {
                      lang = firstLine;
                      codeText = codeSeg.slice(firstNL + 1);
                    }
                  }

                  // Create unique key for this code snippet using messageId from database
                  const codeKey = `msg-${messageKey}-${consoleIdx}-${codeIdx}`;
                  
                  // Check if this is Python code from a bot message
                  const isPython = lang === 'python' || lang === 'py';
                  const isBot = !isUser && message.role !== 'system';
                  
                  return (
                    <div key={`${consoleIdx}-${codeIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <button
                        className="code-btn"
                        onClick={() => openCodeModal(codeText, lang)}
                      >
                        {t('viewCodeSnippet')}
                      </button>
                    </div>
                  );
                }
                return null;
              });
            }
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-panel">
      <ChatConfiguration
        codingLevel={codingLevel}
        onCodingLevelChange={setCodingLevel}
        showModelPicker={!TUTOR_MODE}
        showUsage={SHOW_BUDGET_UI}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        modelsByProvider={modelMetadata.modelsByProvider}
        streamableByModel={modelMetadata.streamableByModel}
        selectedModelStreaming={selectedModelStreaming}
        dailyUsagePercentage={dailyUsagePercentage}
        dailyUsageLoading={dailyUsageLoading}
      />

      {activeSession && conversations.length > 0 && (
        <ChatTabs
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSwitchConversation={switchConversation}
          onCreateConversation={createNewConversation}
          onRenameConversation={updateConversationName}
        />
      )}

      <div className="chat-body" ref={chatBodyRef} onScroll={handleChatScroll}>
        <div className="chat-disclaimer">
          {instance.telemetry ? t('chatDisclaimerCloud') : t('chatDisclaimer')}
        </div>
        {messages.map((msg, idx) => renderMessage(msg, idx))}
        {isStreaming && streamingConversationId === currentConversationId && (
          <div className="chat-spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="loader"></div>
            {!TUTOR_MODE && !selectedModelStreaming && (
              <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
                {t('waitingForFullResponse').replace('{model}', selectedModel)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-context-controls">
          <button
            type="button"
            className={`context-checkbox-btn ${attachedContext.includeCode ? 'context-checkbox-btn--active' : ''}`}
            onClick={() => setAttachedContext(prev => ({ ...prev, includeCode: !prev.includeCode }))}
          >
            <span className="context-checkbox-btn__box">{attachedContext.includeCode ? '✓' : ''}</span>
            <span className="context-checkbox-btn__label">{t('addCodeToChat')}</span>
          </button>
          <button
            type="button"
            className={`context-checkbox-btn ${attachedContext.includeConsole ? 'context-checkbox-btn--active' : ''}`}
            onClick={() => setAttachedContext(prev => ({ ...prev, includeConsole: !prev.includeConsole }))}
            disabled={!consoleHasContent}
          >
            <span className="context-checkbox-btn__box">{attachedContext.includeConsole ? '✓' : ''}</span>
            <span className="context-checkbox-btn__label">{t('addConsoleToChat')}</span>
          </button>
        </div>

        <div className="chat-input-row">
          <textarea
            id="chat-input"
            rows="2"
            placeholder={t('messagePlaceholder')}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button id="chat-send" onClick={handleSendMessage} disabled={isStreaming}>
            {t('send')}
          </button>
        </div>
      </div>

      {/* Code Modal */}
      <CodeModal
        isOpen={codeModalOpen}
        code={currentCodeSnippet.code}
        lang={currentCodeSnippet.lang}
        onClose={closeCodeModal}
        onCopy={handleCopyCode}
        onReplace={handleReplaceCode}
      />

      {/* Console Modal */}
      <ConsoleModal
        isOpen={consoleModalOpen}
        consoleContent={currentConsoleContent}
        onClose={closeConsoleModal}
        onCopy={handleCopyConsole}
      />

      {/* Budget Error Modal */}
      <BudgetErrorModal
        visible={budgetErrorVisible}
        onClose={() => setBudgetErrorVisible(false)}
        accessLevel={userAccessLevel}
        premiumModels={modelMetadata.premiumModels}
        nonPremiumModels={modelMetadata.nonPremiumModels}
      />

    </div>
  );
};

export default ChatPanel;

