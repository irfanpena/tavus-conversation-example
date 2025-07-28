import React, { useEffect, useRef, useState, } from 'react';
import DailyIframe from '@daily-co/daily-js';

const getOrCreateCallObject = () => {
  if (!window._dailyCallObject) {
    window._dailyCallObject = DailyIframe.createCallObject();
  }
  return window._dailyCallObject;
};

const API_KEY = process.env.REACT_APP_API_KEY;
const REPLICA_ID = process.env.REACT_APP_REPLICA_ID;

const App = () => {
  const callRef = useRef(null);
  const [participants, setParticipants] = useState({});
  const [roomUrl, setRoomUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState('start'); // 'start', 'waiting', 'call'
  const [isInitializing, setIsInitializing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  const init = async () => {
    try {
      setIsInitializing(true);
      
      const personaRes = await fetch('https://tavusapi.com/v2/personas ', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          persona_name: 'AI Researcher',
          default_replica_id: REPLICA_ID,
          system_prompt:
            "As an AI researcher at Tavus, you'll play a key role in demonstrating the power of AI technologies used within the company and how they contribute to making Tavus the best it can be.",
        }),
      });

      if (!personaRes.ok) throw new Error('Failed to create persona');
      const personaData = await personaRes.json();
      const PERSONA_ID = personaData.persona_id;

      const convRes = await fetch('https://tavusapi.com/v2/conversations ', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          replica_id: REPLICA_ID,
          persona_id: PERSONA_ID,
        }),
      });

      
      if (!convRes.ok) throw new Error('Failed to create conversation');
      const convData = await convRes.json();

      const conversationUrl = convData.conversation_url;
      setRoomUrl(conversationUrl);

      const call = getOrCreateCallObject();
      callRef.current = call;
      
      await call.startCamera({ url: conversationUrl });
      const localParticipant = call.participants().local;
      const videoTrack = localParticipant.tracks.video.track;

      setCurrentPage('waiting');

      setTimeout(() => {
        const videoElement = document.getElementById('my-video-preview');

        if (videoElement && videoTrack) {
          videoElement.srcObject = new MediaStream([videoTrack]);
          videoElement.play().catch((err) =>
            console.error('Error playing local preview video:', err)
          );
        }
      }, 200);

      call.updateInputSettings({
        audio: {
          processor: {
            type: 'noise-cancellation',
          },
        },
      });

    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const toggleMic = async () => {
    const call = callRef.current;
    if (!call) return;

    setIsMicOn((prev) => !prev);
    const newMicState = !isMicOn;

    await call.setLocalAudio(newMicState);
    if (isCameraOn) {
      if (currentPage === "waiting") {
        await call.startCamera({ url: roomUrl });

        const localParticipant = call.participants().local;
        const videoTrack = localParticipant.tracks.video.track;

        const videoElement = document.getElementById('my-video-preview');

        if (videoElement && videoTrack) {
          videoElement.srcObject = new MediaStream([videoTrack]);
          videoElement
            .play()
            .catch((err) =>
              console.error('Error playing local preview video:', err)
            );
        }
      } else {
        await call.setLocalVideo(true);
      }
    }

  };

  const toggleCamera = async () => {
    const call = callRef.current;
    if (!call) return;

    setIsCameraOn((prev) => !prev);

    const newCameraState = !isCameraOn;
    await call.setLocalVideo(newCameraState);

    if (currentPage === "waiting" && newCameraState) {
      await call.startCamera({ url: roomUrl });

      const localParticipant = call.participants().local;
      const videoTrack = localParticipant.tracks.video.track;

      const videoElement = document.getElementById('my-video-preview');

      if (videoElement && videoTrack) {
        videoElement.srcObject = new MediaStream([videoTrack]);
        videoElement
          .play()
          .catch((err) =>
            console.error('Error playing local preview video:', err)
          );
      }
    }
  };

  const handleEndMeeting = async () => {
    const call = callRef.current;
    if (!call) return;

    try {
      await call.leave();
      callRef.current = null;
      delete window._dailyCallObject;
      setParticipants({});
      setCurrentPage('start');
      setRoomUrl(null);
      window.location.reload(); 
    } catch (err) {
      console.error('Error ending meeting:', err);
    }
  };

  const handleStartCall = () => {
    init();
  };

  const handleJoinCall = () => {
    const call = callRef.current;
    call.join({ url: roomUrl });
    setCurrentPage('call');
    const updateParticipants = () => {
      const allParticipants = call.participants();
      setParticipants({ ...allParticipants });
    };

    call.on('participant-joined', updateParticipants);
    call.on('participant-updated', updateParticipants);
    call.on('participant-left', updateParticipants);
    call.on('joined-meeting', updateParticipants);
    call.on('left-meeting', () => setParticipants({}));

    const handleUnload = (e) => {
      if (callRef.current) {
        callRef.current.leave();
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  };

  useEffect(() => {
    const attachTracks = (id, p) => {
      const videoEl = document.getElementById(`video-${id}`);
      if (
        videoEl &&
        p.tracks.video &&
        p.tracks.video.state === 'playable' &&
        p.tracks.video.persistentTrack
      ) {
        videoEl.srcObject = new MediaStream([p.tracks.video.persistentTrack]);
      }

      const audioEl = document.getElementById(`audio-${id}`);
      if (
        audioEl &&
        p.tracks.audio &&
        p.tracks.audio.state === 'playable' &&
        p.tracks.audio.persistentTrack
      ) {
        audioEl.srcObject = new MediaStream([p.tracks.audio.persistentTrack]);
      }

      const nameEl = document.getElementById(`user-name-${id}`);
      if (id === "local") {
        nameEl.textContent = "You";
      }

      if (nameEl && p.user_name) {
        nameEl.textContent = p.user_name;
      }
    };

    Object.entries(participants).forEach(([id, p]) => {
      attachTracks(id, p);
    });
  }, [participants]);

  const ControlButtons = ({ className = "" }) => {
    return (
      <div className={`flex items-center space-x-4 ${className}`}>
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full transition-all duration-300 ${
            isMicOn 
              ? 'bg-gray-700 hover:bg-gray-600 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          } shadow-lg hover:shadow-xl`}
          title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isMicOn ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off-icon lucide-mic-off"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          )}
        </button>
        
        <button
          onClick={toggleCamera}
          className={`p-3 rounded-full transition-all duration-300 ${
            isCameraOn 
              ? 'bg-gray-700 hover:bg-gray-600 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          } shadow-lg hover:shadow-xl`}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-off-icon lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/></svg>
          )}
        </button>

        {currentPage === 'call' && (
          <button
            onClick={handleEndMeeting}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            title="End Meeting"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  const StartPage = () => {
    return (
      <div className="relative bg-gray-900 w-screen h-screen flex flex-col items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900 opacity-80"
          style={{
            backgroundImage: 'url("/background.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        
        <div className="relative z-10 text-center space-y-8 max-w-2xl mx-auto px-6">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 leading-tight">
            Meet Your AI
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              Researcher
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
            Experience the future of AI conversation with Tavus' advanced digital persona that create dynamic, real-time interactions that feel as natural as talking to a human.
          </p>
          
          <button
            onClick={handleStartCall}
            disabled={isInitializing}
            className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-full transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {isInitializing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing...
              </span>
            ) : (
              <span className="flex items-center">
                Start Video Call
                <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </span>
            )}
          </button>
        </div>
        
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>
    );
  };

  const WaitingRoom = () => {
    return (
      <div className="relative bg-gray-900 w-screen h-screen flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 opacity-50"></div>
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, rgba(147, 51, 234, 0.1) 0%, transparent 50%)`
        }}></div>
        
        <div className="absolute top-20 left-20 w-24 h-24 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-32 right-32 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-16 w-16 h-16 bg-green-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-500"></div>
        
        <div className="relative z-10 flex flex-col items-center space-y-8 max-w-md mx-auto px-6">
          
          <h2 className="text-4xl font-bold text-white text-center leading-tight">
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              Camera Check
            </span>
          </h2>
          
          <p className="text-white font-semibold text-center text-base leading-relaxed">
            Our AI agent will be able to see and hear you during the conversation, so make sure everything looks good!
          </p>
          
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur opacity-60 group-hover:opacity-100 transition duration-300"></div>
            <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video w-80 border border-gray-700">
              <video
                id={`my-video-preview`}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {!isCameraOn && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-off-icon lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/></svg>
                </div>
              )}
              
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-300"></div>
            </div>
          </div>
          
          <ControlButtons />
          
          <button
            onClick={handleJoinCall}
            className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-full transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            <span className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              Join Video Call
              <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </span>
          </button>
        </div>
      </div>
    );
  };

  if (currentPage === 'start') {
    return <StartPage />;
  }

  if (currentPage === 'waiting') {
    return <WaitingRoom />;
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex flex-col justify-center items-center">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 opacity-50"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                          radial-gradient(circle at 75% 75%, rgba(147, 51, 234, 0.1) 0%, transparent 50%)`
      }}></div>

      <main className="flex flex-col gap-6 relative">
        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Render all participant videos */}
          {Object.entries(participants).map(([id, p]) => (
            <div
              key={id}
              className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video w-[30dvw]"
            >
              <video
                id={`video-${id}`}
                autoPlay
                playsInline
                muted={id === "local"}
                className="w-full h-full object-contain mx-auto"
              />
              {id !== "local" && <audio id={`audio-${id}`} autoPlay playsInline />}

              {id === "local" && !isCameraOn && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M16 8v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2l2-2h4l2 2h2a2 2 0 012 2z"></path>
                  </svg>
                </div>
              )}

              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                <p id={`user-name-${id}`}></p>
              </div>

              {id === "local" && !isMicOn && (
                <div className="absolute top-2 right-2 bg-red-600 p-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off-icon lucide-mic-off"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                </div>
              )}
            </div>
          ))}

          {/* Show ControlButtons only after all participants are rendered */}
          {Object.keys(participants).length > 0 && <ControlButtons className="mt-4" />}
        </div>
      </main>
    </div>
  );
};

export default App;