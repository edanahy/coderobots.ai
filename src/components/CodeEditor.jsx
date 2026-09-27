import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { EditorView } from '@codemirror/view';

const CodeEditor = forwardRef(({ initialCode = '# Start your project here!\n', onChange, onPaste, language = 'python' }, ref) => {
  const editorViewRef = useRef(null);
  const codeRef = useRef(initialCode);
  // Read through a ref so the (per-render) extension always calls the latest.
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    onPasteRef.current = onPaste;
  });

  useImperativeHandle(ref, () => ({
    getCode: () => {
      return codeRef.current;
    },
    setCode: (code) => {
      codeRef.current = code;
      // Force update through the view if available
      if (editorViewRef.current) {
        const view = editorViewRef.current;
        const transaction = view.state.update({
          changes: { from: 0, to: view.state.doc.length, insert: code }
        });
        view.dispatch(transaction);
      }
    }
  }));

  const handleChange = (value) => {
    codeRef.current = value;
    if (onChange) {
      onChange(value);
    }
  };

  return (
    <CodeMirror
      defaultValue={initialCode}
      height="100%"
      extensions={[
        language === 'cpp' ? cpp() : python(),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'Monaco, Courier New, monospace'
          },
          '.cm-line': {
            fontWeight: 'bold',
          }
        }),
        // Runs before CodeMirror inserts the text (returning false lets the
        // paste proceed); the resulting onChange follows synchronously.
        EditorView.domEventHandlers({
          paste: (event) => {
            onPasteRef.current?.(event.clipboardData?.getData('text/plain') || '');
            return false;
          },
        }),
      ]}
      onChange={handleChange}
      onCreateEditor={(view) => {
        editorViewRef.current = view;
      }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightSpecialChars: true,
        history: true,
        foldGutter: true,
        drawSelection: true,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        syntaxHighlighting: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        rectangularSelection: true,
        crosshairCursor: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        defaultKeymap: true,
        searchKeymap: true,
        historyKeymap: true,
        foldKeymap: true,
        completionKeymap: true,
        lintKeymap: true,
      }}
    />
  );
});

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;

