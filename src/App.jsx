import { useRef, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import SPIKEEditor from './components/SPIKEEditor';
import ChatPanel from './components/ChatPanel';
import AuthModal from './components/AuthModal';
import SessionModal from './components/SessionModal';
import NewSessionModal from './components/NewSessionModal';
import TitleBar from './components/TitleBar';
import HardwareConfigModal from './components/HardwareConfigModal';
import StudentGroupModal from './components/StudentGroupModal';
import DebugManager, { debugLog } from './components/DebugManager';
import DataExtractor from './components/data_extractor/DataExtractor';
import AdminUsageDashboard from './components/admin_usage/AdminUsageDashboard';
import AdminUsersDashboard from './components/admin_users/AdminUsersDashboard';
import AdminUserDetail from './components/admin_users/AdminUserDetail';
import ReplayView from './components/replay/ReplayView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SessionProvider, useSession } from './contexts/SessionContext';
import instance from './config/instance';
import { logConsole, logInteraction } from './services/dataLogger';
import {
  getUserProfile,
  saveUserProfile,
  profileNeedsStudentGroup,
} from './services/userProfile';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const {
    activeSession,
    sessions,
    loadSessions,
    setActiveSessionById,
    updateSessionName,
    currentCodeContent,
    updateCurrentCodeContent,
    createSnapshot,
    availablePlatforms,
    createSessionWithPlatform,
    assignPlatformToSession,
    pendingPlatformSession,
    clearPendingPlatformSession,
  } = useSession();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalCancellable, setSessionModalCancellable] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showHardwareConfigModal, setShowHardwareConfigModal] = useState(false);
  const [sessionsInitialized, setSessionsInitialized] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [needsStudentGroup, setNeedsStudentGroup] = useState(false);
  const [savingStudentGroup, setSavingStudentGroup] = useState(false);
  const [newSessionModalState, setNewSessionModalState] = useState({
    visible: false,
    mode: 'create',
    initialName: '',
  });

  const resizerRef = useRef(null);
  const containerRef = useRef(null);
  const spikeEditorRef = useRef(null);

  // Show auth modal if not authenticated (never on anonymous instances)
  useEffect(() => {
    if (instance.telemetry && !authLoading && !user) {
      setShowAuthModal(true);
    } else {
      setShowAuthModal(false);
    }
  }, [user, authLoading]);

  // Reset profile state on sign-out so the next sign-in re-checks.
  useEffect(() => {
    if (!user) {
      setProfileChecked(false);
      setNeedsStudentGroup(false);
    }
  }, [user]);

  // Check whether the user has recorded their student group yet.
  // No profiles without telemetry — skip straight to "checked".
  useEffect(() => {
    if (user && !authLoading && !profileChecked) {
      if (!instance.telemetry) {
        setProfileChecked(true);
        return;
      }
      getUserProfile().then((profile) => {
        setNeedsStudentGroup(profileNeedsStudentGroup(profile));
        setProfileChecked(true);
      });
    }
  }, [user, authLoading, profileChecked]);

  const handleStudentGroupSubmit = async (studentsText) => {
    setSavingStudentGroup(true);
    const saved = await saveUserProfile({ students: studentsText });
    setSavingStudentGroup(false);
    if (saved) {
      setNeedsStudentGroup(false);
    }
  };

  // Load sessions and show session modal when authenticated (only once)
  useEffect(() => {
    if (
      user &&
      !authLoading &&
      profileChecked &&
      !needsStudentGroup &&
      !sessionsInitialized
    ) {
      loadSessions().then((userSessions) => {
        if (userSessions && userSessions.length > 0) {
          // Show session modal (non-cancellable on first load)
          setSessionModalCancellable(false);
          setShowSessionModal(true);
        } else {
          // No sessions yet — open the new-session modal instead of silently creating one.
          setNewSessionModalState({ visible: true, mode: 'create', initialName: '' });
        }
        setSessionsInitialized(true);
      });
    }
  }, [
    user,
    authLoading,
    profileChecked,
    needsStudentGroup,
    sessionsInitialized,
    loadSessions,
  ]);

  // When SessionContext flags a legacy session that needs a platform, open the modal in assign mode.
  useEffect(() => {
    if (pendingPlatformSession) {
      setShowSessionModal(false);
      setNewSessionModalState({
        visible: true,
        mode: 'assign',
        initialName: pendingPlatformSession.name || '',
      });
    }
  }, [pendingPlatformSession]);

  // Resizable pane logic
  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container) return;

    let isDragging = false;

    const handleMouseDown = (e) => {
      e.preventDefault();
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const rect = container.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const percent = (offsetX / rect.width) * 100;

      // Constrain between 15% and 85%
      const constrainedPercent = Math.min(Math.max(percent, 15), 85);
      container.style.gridTemplateColumns = `${constrainedPercent}% 5px auto`;
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [user, activeSession]);

  const handleSessionSelect = async (sessionId) => {
    setShowSessionModal(false);
    await setActiveSessionById(sessionId);
  };

  const handleOpenNewSessionModal = () => {
    setShowSessionModal(false);
    setNewSessionModalState({ visible: true, mode: 'create', initialName: '' });
  };

  const handleNewSessionSubmit = async ({ name, platformId }) => {
    if (newSessionModalState.mode === 'assign' && pendingPlatformSession) {
      const ok = await assignPlatformToSession(pendingPlatformSession.id, platformId);
      if (ok) {
        setNewSessionModalState({ visible: false, mode: 'create', initialName: '' });
      }
      return;
    }
    const ok = await createSessionWithPlatform({ name, platformId });
    if (ok) {
      setNewSessionModalState({ visible: false, mode: 'create', initialName: '' });
    }
  };

  const handleNewSessionCancel = () => {
    setNewSessionModalState({ visible: false, mode: 'create', initialName: '' });
  };

  const handleReplaceCode = async (newCode) => {
    // Create snapshot for AI replacement with the new code
    await createSnapshot('ai_replace', newCode);
    if (activeSession?.id) {
      await logInteraction('replace_ai_code', activeSession.id);
    }

    // Update the current code in session context (local state)
    await updateCurrentCodeContent(newCode);
  };

  const getCodeContent = async () => {
    if (spikeEditorRef.current) {
      return spikeEditorRef.current.getCode();
    }
    return currentCodeContent;
  };

  const getConsoleContent = async () => {
    if (spikeEditorRef.current) {
      return spikeEditorRef.current.getBuffer();
    }
    return '';
  };

  const openSessionSelector = async () => {
    await loadSessions();
    setSessionModalCancellable(true);
    setShowSessionModal(true);
  };

  const handleSaveSession = async () => {
    if (!activeSession?.id) {
      debugLog('Cannot save: No active session');
      return;
    }

    try {
      // Create code snapshot for manual save
      await createSnapshot('manual_save');
      await logInteraction('manual_save', activeSession.id);

      // Get current code and console content
      const currentConsole = await getConsoleContent();

      // Log console
      if (currentConsole) {
        await logConsole(currentConsole, activeSession.id, 'manual_save');
        debugLog(`Saved console (${currentConsole.length} characters)`);
      }

      debugLog('✅ Session saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
      debugLog(`❌ Error saving session: ${error.message}`);
    }
  };

  if (authLoading) {
    return (
      <div className="app-container">
        <TitleBar />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthModal visible={showAuthModal} />
        <div className="app-container">
          <TitleBar 
            onShowDebug={() => setShowDebugModal(true)}
            onOpenHardwareConfig={() => setShowHardwareConfigModal(true)}
          />
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <p>Please sign in to continue</p>
          </div>
        </div>
        <DebugManager 
          visible={showDebugModal} 
          onClose={() => setShowDebugModal(false)} 
        />
      </>
    );
  }

  return (
    <>
      <SessionModal
        visible={showSessionModal}
        sessions={sessions}
        onSelect={handleSessionSelect}
        onCreateNew={handleOpenNewSessionModal}
        cancellable={sessionModalCancellable}
        onCancel={() => setShowSessionModal(false)}
      />

      <NewSessionModal
        visible={newSessionModalState.visible}
        mode={newSessionModalState.mode}
        initialName={newSessionModalState.initialName}
        platforms={availablePlatforms || []}
        onSubmit={handleNewSessionSubmit}
        onCancel={
          newSessionModalState.mode === 'assign'
            ? () => {
                clearPendingPlatformSession();
                handleNewSessionCancel();
              }
            : handleNewSessionCancel
        }
      />
      
      <div className="app-container">
        <TitleBar 
          onSaveSession={handleSaveSession}
          onOpenSessions={openSessionSelector}
          onShowDebug={() => setShowDebugModal(true)}
          onOpenHardwareConfig={() => setShowHardwareConfigModal(true)}
          activeSession={activeSession}
          onUpdateSessionName={updateSessionName}
        />
        <div className="main-content" ref={containerRef}>
          <div className="left-panel">
            <SPIKEEditor 
              ref={spikeEditorRef}
              sessionId={activeSession?.id}
            />
          </div>
          <div className="horizontal-resizer" ref={resizerRef}></div>
          <div className="right-panel">
            <ChatPanel
              onReplaceCode={handleReplaceCode}
              getCodeContent={getCodeContent}
              getConsoleContent={getConsoleContent}
            />
          </div>
        </div>
      </div>

      <DebugManager 
        visible={showDebugModal} 
        onClose={() => setShowDebugModal(false)} 
      />
      <HardwareConfigModal
        visible={showHardwareConfigModal}
        onClose={() => setShowHardwareConfigModal(false)}
      />
      <StudentGroupModal
        visible={profileChecked && needsStudentGroup}
        onSubmit={handleStudentGroupSubmit}
        saving={savingStudentGroup}
      />
    </>
  );
}

function App() {
  return (
    <Routes>
      {/*
        Replay viewer is public and must never touch auth/Supabase, so it is
        rendered OUTSIDE AuthProvider/SessionProvider (both hit Supabase on mount).
      */}
      {instance.routes.admin && (
        <Route path="/view-data" element={<ReplayView />} />
      )}
      <Route
        path="/*"
        element={
          <AuthProvider>
            <SessionProvider>
              <Routes>
                <Route path="/" element={<AppContent />} />
                {instance.routes.admin && (
                  <Route path="/data" element={<DataExtractor />} />
                )}
                {instance.routes.admin && (
                  <Route path="/usage" element={<AdminUsageDashboard />} />
                )}
                {instance.routes.admin && (
                  <Route path="/users" element={<AdminUsersDashboard />} />
                )}
                {instance.routes.admin && (
                  <Route path="/users/:userId" element={<AdminUserDetail />} />
                )}
              </Routes>
            </SessionProvider>
          </AuthProvider>
        }
      />
    </Routes>
  );
}

export default App;
