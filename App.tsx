
import React, { useState, useEffect, useRef } from 'react';
import { 
  connectLiveSession, 
  createPcmBlob, 
  decodeBase64, 
  decodeAudioData 
} from './services/geminiService';
import { 
  MicrophoneIcon, 
  SparklesIcon, 
  ExclamationTriangleIcon, 
  StopCircleIcon,
  SpeakerIcon
} from './components/Icons';

const App: React.FC = () => {
  const [experience, setExperience] = useState('');
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true); 
  const [isPaused, setIsPaused] = useState(false);

  // Teleprompter State
  const [interviewerText, setInterviewerText] = useState('');
  const [suggestedScript, setSuggestedScript] = useState('');

  // Refs for audio/session and state tracking in closures
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptScrollRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);

  // Keep ref in sync with state for audio processing closure
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (scriptScrollRef.current && !isPaused) {
      scriptScrollRef.current.scrollTop = scriptScrollRef.current.scrollHeight;
    }
  }, [suggestedScript, isPaused]);

  const startMeeting = async () => {
    if (!experience) {
      setError("Provide your context first. The AI needs facts to build human stories.");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      setInterviewerText('');
      setSuggestedScript('');
      setIsPaused(false);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true, 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      mediaStreamRef.current = stream;

      inputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const sessionPromise = connectLiveSession(experience, {
        onAudioChunk: async (base64) => {
          if (isMuted || !outputAudioCtxRef.current || isPausedRef.current) return;
          const ctx = outputAudioCtxRef.current;
          const buffer = await decodeAudioData(decodeBase64(base64), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
        },
        onInterruption: () => {
          if (!isPausedRef.current) {
            setSuggestedScript(prev => prev + " [Interrupted] ");
          }
        },
        onInputTranscription: (text) => {
          if (!isPausedRef.current) {
            setInterviewerText(prev => prev + text);
          }
        },
        onOutputTranscription: (text) => {
          if (!isPausedRef.current) {
            setSuggestedScript(prev => prev + text);
          }
        },
        onTurnComplete: () => {
          if (!isPausedRef.current) {
            setInterviewerText('');
          }
        },
        onError: (e) => {
          console.error(e);
          setError("Connection drop. Check your internet.");
          endMeeting();
        },
        onClose: () => endMeeting()
      });

      const session = await sessionPromise;
      sessionRef.current = session;

      const source = inputAudioCtxRef.current.createMediaStreamSource(stream);
      const processor = inputAudioCtxRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        // If paused, we stop sending audio so the AI stops "hearing" and generating
        if (isPausedRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        session.sendRealtimeInput({ media: createPcmBlob(inputData) });
      };

      source.connect(processor);
      processor.connect(inputAudioCtxRef.current.destination);

      setIsMeetingActive(true);
    } catch (err) {
      console.error(err);
      setError("Couldn't start. Make sure you allow audio capture.");
    } finally {
      setIsConnecting(false);
    }
  };

  const endMeeting = () => {
    sessionRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    inputAudioCtxRef.current?.close();
    outputAudioCtxRef.current?.close();
    setIsMeetingActive(false);
    setIsConnecting(false);
    setIsPaused(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans select-none">
      
      {/* Stealth Header */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-indigo-500 animate-pulse'}`} />
          <h1 className="text-xs font-bold tracking-widest text-slate-500 uppercase">
            {isPaused ? 'Co-Pilot Frozen' : 'Live Session Monitor'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${isMuted ? 'bg-slate-800 text-slate-400' : 'bg-indigo-600 text-white'}`}
          >
            {isMuted ? 'Stealth: Muted' : 'Audio: Active'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8 gap-6 overflow-hidden">
        
        {!isMeetingActive ? (
          <div className="flex-1 flex flex-col justify-center items-center max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-black text-white">Ready to pull it off?</h2>
              <p className="text-slate-400 leading-relaxed">
                Paste your experience context below. During the call, share your system audio (Zoom/Teams tab) so the Co-Pilot can listen and script your answers in real-time.
              </p>
            </div>
            
            <div className="w-full bg-slate-900/50 border border-white/10 rounded-3xl p-6 focus-within:border-indigo-500/50 transition-all">
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-4 tracking-tighter">Your Background / Facts</label>
              <textarea
                className="w-full h-48 bg-transparent border-none focus:ring-0 text-slate-200 placeholder:text-slate-700 resize-none leading-relaxed"
                placeholder="Bullet points of your career wins... The AI needs the nitty-gritty to make the script hold up."
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              />
            </div>

            <button
              onClick={startMeeting}
              disabled={isConnecting}
              className="group w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-lg transition-all shadow-2xl shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-4"
            >
              {isConnecting ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <SparklesIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                  Enter Stealth Mode
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            
            {/* Interviewer Transcript (Small Monitor) */}
            <div className={`h-24 transition-opacity duration-300 ${isPaused ? 'opacity-40 grayscale' : 'opacity-100'} bg-slate-900/40 border border-white/5 rounded-2xl p-4 flex flex-col`}>
              <span className="text-[10px] font-black text-slate-500 uppercase mb-1">
                {isPaused ? 'Interviewer Monitor (Frozen)' : 'Interviewer (Listening...)'}
              </span>
              <div className="flex-1 overflow-y-auto text-sm text-slate-400 italic">
                {interviewerText || "Waiting for audio signal..."}
              </div>
            </div>

            {/* Main Teleprompter (Suggested Script) */}
            <div className={`flex-1 transition-all duration-300 ${isPaused ? 'ring-2 ring-amber-500/50 bg-slate-900/40' : 'bg-slate-900/20'} border border-white/5 rounded-[40px] p-8 md:p-12 flex flex-col relative overflow-hidden shadow-inner`}>
              <div className="absolute top-8 left-8 flex items-center gap-2">
                <SparklesIcon className={`w-4 h-4 ${isPaused ? 'text-amber-400' : 'text-indigo-400'}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${isPaused ? 'text-amber-400' : 'text-slate-500'}`}>
                  {isPaused ? 'PAUSED - FINISH READING' : 'Live Script (Read Aloud)'}
                </span>
              </div>
              
              <div 
                ref={scriptScrollRef}
                className="flex-1 overflow-y-auto pr-4 custom-scrollbar mt-6"
              >
                <p className="text-2xl md:text-3xl lg:text-4xl font-medium leading-[1.6] text-slate-100 whitespace-pre-wrap transition-all">
                  {suggestedScript || (
                    <span className="text-slate-700 italic">The co-pilot is listening... basically, once the interviewer asks something, your script will stream here. It’ll hold up.</span>
                  )}
                </p>
              </div>

              {/* Progress/Sync Bar */}
              <div className="mt-8 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${isPaused ? 'bg-amber-500' : 'bg-indigo-500 animate-[shimmer_2s_infinite]'} w-full transition-all duration-500`} />
              </div>
            </div>

            {/* Live Controls */}
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex gap-4">
                <button 
                  onClick={() => setSuggestedScript('')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-400 uppercase transition-all"
                >
                  Clear Script
                </button>
                <button 
                  onClick={() => setIsPaused(!isPaused)}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${isPaused ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' : 'bg-amber-600/20 text-amber-500 border border-amber-500/30'}`}
                >
                  {isPaused ? '▶ Resume Listening' : '⏸ Freeze Script'}
                </button>
              </div>
              <button
                onClick={endMeeting}
                className="px-8 py-4 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
              >
                End Session
              </button>
            </div>
          </div>
        )}
      </main>

      {error && (
        <div className="fixed bottom-6 right-6 p-5 bg-red-950/80 backdrop-blur-xl border border-red-500/30 rounded-3xl flex items-center gap-4 text-red-200 text-sm shadow-2xl z-[100] animate-in slide-in-from-bottom-10">
          <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
          <div className="flex flex-col">
            <span className="font-black uppercase text-[10px]">Error</span>
            {error}
          </div>
          <button onClick={() => setError(null)} className="ml-4 opacity-30 hover:opacity-100">✕</button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
      `}</style>
    </div>
  );
};

export default App;
