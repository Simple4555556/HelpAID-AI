import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, User, ShieldAlert, Bot, Info, X, Sparkles, Phone, MapPin, ArrowLeft, Volume2, VolumeX, History as HistoryIcon, Plus, Activity } from 'lucide-react';
import { chatAssistant } from '../lib/gemini';
import { cn } from '../lib/utils';
import { User as FirebaseUser } from 'firebase/auth';
import { API_BASE_URL } from '../config';

interface Message {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  isEmergency?: boolean;
}

const QUICK_PROMPTS = [
  'What should I do for chest pain?',
  'Severe bleeding help',
  'How to perform CPR?',
  'Signs of a stroke?',
  'Snake bite first aid',
  'Burn treatment steps',
];

export default function AIChatAssistant({ user }: { user: FirebaseUser | null }) {
  const [chatId, setChatId] = useState<string>(() => `chat_${Date.now()}`);
  const [pastChats, setPastChats] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [reportResult, setReportResult] = useState<any>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: "Hello! I'm your AI Doctor, your emergency medical assistant. I can help with first aid guidance, symptom information, and finding nearby medical help. How can I assist you right now?",
      timestamp: new Date(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [voiceLang, setVoiceLang] = useState<'en-US' | 'hi-IN'>('en-US');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (user) {
      fetchPastChats();
    }
  }, [user]);

  const fetchPastChats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chats?userId=${user?.uid}`);
      if (res.ok) {
        const data = await res.json();
        setPastChats(data);
      }
    } catch (err) {
      console.error('Failed to load past chats:', err);
    }
  };

  const saveActiveChat = async (updatedMessages: Message[]) => {
    if (!user) return;
    try {
      const history = updatedMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.text
      }));
      // Basic heuristics to extract symptoms / AI suggestions / followUpQuestions
      const symptoms: string[] = [];
      const aiSuggestions: string[] = [];
      const followUpQuestions: string[] = [];

      updatedMessages.forEach(m => {
        if (m.role === 'user') {
          if (m.text.toLowerCase().includes('pain') || m.text.toLowerCase().includes('fever') || m.text.toLowerCase().includes('hurt')) {
            symptoms.push(m.text);
          }
        } else {
          if (m.text.toLowerCase().includes('should') || m.text.toLowerCase().includes('try') || m.text.toLowerCase().includes('recommend')) {
            aiSuggestions.push(m.text);
          }
        }
      });

      await fetch(`${API_BASE_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          chatId,
          history,
          symptoms: symptoms.slice(0, 5),
          aiSuggestions: aiSuggestions.slice(0, 5),
          followUpQuestions: followUpQuestions.slice(0, 5)
        })
      });
      fetchPastChats(); // refresh list
    } catch (err) {
      console.error('Failed to save active chat:', err);
    }
  };

  const loadPastChat = (chat: any) => {
    setChatId(chat.chatId);
    const loadedMessages: Message[] = chat.history.map((h: any) => ({
      role: h.role === 'model' ? 'ai' : 'user',
      text: h.content,
      timestamp: chat.timestamp ? new Date(chat.timestamp) : new Date()
    }));
    setMessages(loadedMessages);
    setShowHistoryModal(false);
  };

  const startNewChat = () => {
    setChatId(`chat_${Date.now()}`);
    setMessages([
      {
        role: 'ai',
        text: "Hello! I'm your AI Doctor, your emergency medical assistant. I can help with first aid guidance, symptom information, and finding nearby medical help. How can I assist you right now?",
        timestamp: new Date(),
      }
    ]);
  };

  const handleEndSession = async () => {
    if (messages.length <= 1) return;
    setGeneratingReport(true);
    setReportResult(null);
    try {
      const historyPayload = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.text
      }));
      const res = await fetch(`${API_BASE_URL}/api/generate-observation-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          history: historyPayload
        })
      });
      if (res.ok) {
        const data = await res.json();
        setReportResult(data);
        setNotification('Medical Observation Report generated successfully!');
      } else {
        setNotification('Failed to generate report.');
      }
    } catch (err) {
      console.error(err);
      setNotification('Failed to generate report due to a network issue.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const speakText = (text: string, lang: 'en-US' | 'hi-IN') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/[\*\_]/g, '')
      .replace(/#+/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (text?: string) => {
    const query = text ?? input;
    if (!query.trim() || loading) return;
    const userMsg: Message = { role: 'user', text: query, timestamp: new Date() };
    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = updatedWithUser.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.text
      }));
      const aiResponse = await chatAssistant(query, historyPayload);
      const isEmergency = /emergency|critical|urgent|ambulance|911|108|immediately|life-threatening/i.test(aiResponse);
      const updatedWithAI: Message[] = [...updatedWithUser, { role: 'ai' as const, text: aiResponse, timestamp: new Date(), isEmergency }];
      setMessages(updatedWithAI);
      if (voiceOutputEnabled) {
        speakText(aiResponse, voiceLang);
      }
      if (user) {
        saveActiveChat(updatedWithAI);
      }
    } catch {
      const updatedWithError: Message[] = [
        ...updatedWithUser,
        {
          role: 'ai' as const,
          text: 'Sorry, I encountered an error. Please try again — or call emergency services (108) if this is urgent.',
          timestamp: new Date(),
          isEmergency: true,
        },
      ];
      setMessages(updatedWithError);
      if (user) {
        saveActiveChat(updatedWithError);
      }
    } finally {
      setLoading(false);
    }
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      setNotification('Speech recognition is not supported in your browser.');
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = voiceLang;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      inputRef.current?.focus();
    };
    recognition.start();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      className="fixed inset-0 bg-[#F9FAFB] dark:bg-gray-950 z-100 flex flex-col max-w-3xl mx-auto"
    >
      {/* ── HEADER ── */}
      <header className="shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-1.5 rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all mr-1"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </Link>
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=AIDoctor" alt="AI Doctor" className="w-10 h-10 rounded-full bg-blue-100 shrink-0 border border-gray-200" />
          <div className="hidden sm:block">
            <h2 className="font-bold text-[#1D58D8] text-[16px] leading-tight">AI Doctor</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-[#B91C1C] rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-[#B91C1C]">Emergency Mode</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {user && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
              title="Past Chats"
            >
              <HistoryIcon size={16} />
            </button>
          )}

          {messages.length > 1 && (
            <>
              <button
                onClick={startNewChat}
                className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                title="Start New Chat"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={handleEndSession}
                disabled={generatingReport}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all"
                title="Generate Observation Report"
              >
                {generatingReport ? <Activity size={12} className="animate-spin" /> : <Sparkles size={12} />}
                <span>Report</span>
              </button>
            </>
          )}

          {/* SOS Emergency Link */}
          <a
            href="tel:108"
            className="flex items-center gap-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white px-3 py-2 rounded-xl font-bold shadow-md transition-all active:scale-95 text-xs"
          >
            🚨 SOS 108
          </a>
        </div>
      </header>

      {/* ── MESSAGES ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 no-scrollbar"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={cn(
                'flex gap-3 max-w-[88%]',
                m.role === 'user' ? 'ml-auto flex-col items-end' : 'mr-auto flex-col'
              )}
            >
              {/* AI Avatar Header */}
              {m.role === 'ai' && (
                <div className="flex items-center justify-between w-full px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#1D58D8] text-white flex items-center justify-center shadow-sm">
                      <Bot size={14} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AI Doctor</span>
                  </div>
                  <button
                    onClick={() => speakText(m.text, voiceLang)}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Speak Message"
                  >
                    <Volume2 size={14} />
                  </button>
                </div>
              )}

              {/* Bubble */}
              <div className="flex flex-col w-full">
                {/* Emergency AI response */}
                {m.role === 'ai' && m.isEmergency ? (
                  <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col relative">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#B91C1C]" />
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert size={16} className="text-[#B91C1C]" />
                        <span className="text-[12px] font-bold text-[#B91C1C] uppercase tracking-wide">Immediate Action Required</span>
                      </div>
                      <div className="text-[14px] text-gray-800 space-y-3 prose prose-sm max-w-none mb-4" dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br/>') }} />
                      
                      <div className="bg-[#FDECE9] rounded-[16px] py-2 px-4 flex items-center justify-between mb-4">
                        <span className="text-[12px] font-bold text-gray-900">Ambulance dispatched: 4 mins away</span>
                        <MapPin size={14} className="text-gray-900" />
                      </div>
                    </div>
                    
                    {/* Visual Guide Image */}
                    <div className="relative w-full rounded-[24px] overflow-hidden mt-2">
                      <img src="https://images.unsplash.com/photo-1584362917165-526a968579e8?w=500&h=250&fit=crop" alt="Recovery Position" className="w-full h-[140px] object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-white py-2 px-4 flex justify-center">
                        <span className="text-[10px] font-bold text-gray-900">Visual Guide: The Recovery Position</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    'px-5 py-4 rounded-[24px] text-[15px] leading-relaxed shadow-sm',
                    m.role === 'user'
                      ? 'bg-[#2E3036] text-white rounded-tr-sm'
                      : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                  )}>
                    {m.text}
                  </div>
                )}

                {m.role === 'user' && (
                  <span className="text-[10px] font-medium text-gray-400 px-2 mt-1.5 text-right">Delivered</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 mr-auto"
          >
            <div className="flex items-center gap-2 px-1">
              <div className="w-6 h-6 rounded-full bg-[#1D58D8] text-white flex items-center justify-center shadow-sm">
                <Bot size={14} />
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AI Doctor</span>
            </div>
            <div className="px-5 py-4 bg-white rounded-[24px] rounded-tl-sm shadow-sm border border-gray-100 flex gap-1.5 items-center w-fit">
              <div className="w-2 h-2 bg-[#B91C1C] rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-[#B91C1C] rounded-full animate-bounce [animation-delay:0.15s]" />
              <div className="w-2 h-2 bg-[#B91C1C] rounded-full animate-bounce [animation-delay:0.3s]" />
            </div>
          </motion.div>
        )}

        <div className="h-4 shrink-0" />
      </div>

      {/* ── QUICK PROMPTS ── */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} onClick={() => handleSend(prompt)} className="shrink-0 text-[13px] font-medium text-[#1D58D8] bg-white border border-gray-200 px-4 py-2.5 rounded-full shadow-sm hover:bg-gray-50 active:scale-95 transition-all">
            {prompt}
          </button>
        ))}
      </div>

      {/* ── INPUT BAR ── */}
      <div className="shrink-0 bg-white px-4 sm:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2">
        {/* Language selector */}
        <button
          onClick={() => setVoiceLang(prev => prev === 'en-US' ? 'hi-IN' : 'en-US')}
          className="shrink-0 text-xs font-bold px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
          title="Toggle Language"
        >
          {voiceLang === 'en-US' ? 'EN' : 'हि'}
        </button>

        {/* Speak Output Toggle */}
        <button
          onClick={() => {
            setVoiceOutputEnabled(prev => !prev);
            if (voiceOutputEnabled) window.speechSynthesis.cancel();
          }}
          className={cn(
            "shrink-0 p-2 rounded-full",
            voiceOutputEnabled ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:text-gray-600"
          )}
          title="Toggle Voice Output"
        >
          {voiceOutputEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        <button
          onClick={startVoiceInput}
          className={cn(
            'shrink-0 p-2 rounded-full flex items-center justify-center transition-all',
            isRecording ? 'text-[#B91C1C] animate-pulse bg-red-50' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Mic size={24} />
        </button>
        <div className="flex-1 bg-[#F3F4F6] rounded-full px-5 py-3.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Describe the medical situation..."
            className="w-full bg-transparent text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="shrink-0 w-12 h-12 bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-90"
        >
          <Send size={20} className="ml-1" />
        </button>
      </div>

      {/* ── TOAST ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 bg-gray-900 text-white rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border border-white/10 backdrop-blur-xl max-w-[90vw]"
          >
            <div className="p-1.5 bg-red-600 rounded-lg shrink-0">
              <Info size={14} className="text-white" />
            </div>
            <span className="flex-1 leading-snug">{notification}</span>
            <button onClick={() => setNotification(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── REPORT RESULT MODAL ── */}
      {reportResult && (
        <div className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-[28px] max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl relative border border-gray-100 dark:border-gray-800">
            <button onClick={() => setReportResult(null)} className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
              <X size={18} />
            </button>
            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">HelpAid AI Scribe</span>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">Observation Report</h3>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800" />
            
            <div className="space-y-4 text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-200">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Symptoms Observed</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {reportResult.symptomsObserved?.map((s: string, idx: number) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Clinical Assessment</h4>
                <p className="bg-gray-50 dark:bg-gray-805 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">{reportResult.clinicalAssessment}</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Guidance Given</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {reportResult.guidanceGiven?.map((g: string, idx: number) => (
                    <li key={idx}>{g}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1D58D8] dark:text-blue-400 uppercase tracking-wider mb-1">Suggested Next Actions</h4>
                <ul className="list-disc pl-5 space-y-1 text-[#1D58D8] dark:text-blue-400">
                  {reportResult.suggestedActions?.map((a: string, idx: number) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="pt-4 flex gap-3">
              <button onClick={() => setReportResult(null)} className="flex-1 py-3.5 rounded-2xl bg-[#1D58D8] text-white font-bold text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all text-center">
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY MODAL ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-[28px] max-w-md w-full max-h-[75vh] overflow-y-auto p-6 space-y-6 shadow-2xl relative border border-gray-100 dark:border-gray-800">
            <button onClick={() => setShowHistoryModal(false)} className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
              <X size={18} />
            </button>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">Past AI Consultations</h3>
              <p className="text-xs text-gray-400">Revisit previous chat history log files.</p>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800" />
            
            <div className="space-y-3 overflow-y-auto max-h-[50vh] pr-1">
              {pastChats.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-6">No previous chat sessions found.</p>
              ) : (
                pastChats.map((c) => (
                  <button
                    key={c.chatId}
                    onClick={() => loadPastChat(c)}
                    className="w-full text-left p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-800 transition-all flex justify-between items-center group"
                  >
                    <div className="space-y-1 pr-4 truncate">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {c.history?.[1]?.content || 'Symptom Consultation'}
                      </h4>
                      <p className="text-[10px] text-gray-400">
                        {c.timestamp ? new Date(c.timestamp).toLocaleString('en-IN') : 'Previous Session'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold bg-gray-200 dark:bg-gray-800 px-2.5 py-1 rounded-full text-gray-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      Load
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
