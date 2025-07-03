import { useEffect, useRef, useState } from "react";
import DailyIframe from '@daily-co/daily-js';

const App = () => {
  const callRef = useRef(null);
  const localVideoRef = useRef(null);

  const [remoteParticipants, setRemoteParticipants] = useState({});
  const [roomUrl, setRoomUrl] = useState(null);
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const API_KEY = process.env.REACT_APP_API_KEY;
  const REPLICA_ID = process.env.REACT_APP_REPLICA_ID;

  const getOrCreateCallObject = () => {
    if (!window._dailyCallObject) {
      window._dailyCallObject = DailyIframe.createCallObject();
    }
    return window._dailyCallObject;
  };

  // Step 1: Create persona and conversation
  useEffect(() => {
    const init = async () => {
      try {
        // 1a. Create Persona
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

        // 1b. Create Conversation
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

        setRoomUrl(convData.conversation_url);
        setLoading(false);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    init();
  
  // eslint-disable-next-line
  }, []);

  // Step 2: Get local media for waiting room
  useEffect(() => {
    const getLocalPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to get local media:', err);
      }
    };

    getLocalPreview();

    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };

  // eslint-disable-next-line
  }, []);

  // Helper function to update local video from call object
  const updateLocalVideo = (call) => {
    if (localVideoRef.current && call) {
      const participants = call.participants();
      const localParticipant = participants.local;
      
      if (localParticipant?.tracks?.video?.persistentTrack) {
        const localVideoStream = new MediaStream([localParticipant.tracks.video.persistentTrack]);
        localVideoRef.current.srcObject = localVideoStream;
      }
    }
  };

  // Step 3: Join call
  const joinCall = () => {
    setLoading(true);
    const call = getOrCreateCallObject();
    callRef.current = call;

    call.join({ url: roomUrl, audioSource: micEnabled, videoSource: camEnabled });

    const updateRemoteParticipants = () => {
      const participants = call.participants();
      const remotes = {};
      Object.entries(participants).forEach(([id, p]) => {
        if (id !== 'local') remotes[id] = p;
      });
      setRemoteParticipants(remotes);
      
      // Update local video whenever participants change
      updateLocalVideo(call);
    };

    call.on('participant-joined', updateRemoteParticipants);
    call.on('participant-updated', updateRemoteParticipants);
    call.on('participant-left', updateRemoteParticipants);

    call.on('joined-meeting', () => {
      setJoined(true);
      setLoading(false);
      // Update local video when joined
      updateLocalVideo(call);
    });

    // Listen for track updates to keep local video in sync
    call.on('track-started', (event) => {
      if (event.participant && event.participant.local) {
        updateLocalVideo(call);
      }
    });

    call.on('track-stopped', (event) => {
      if (event.participant && event.participant.local) {
        updateLocalVideo(call);
      }
    });
  };

  // Step 4: Attach remote tracks
  useEffect(() => {
    Object.entries(remoteParticipants).forEach(([id, p]) => {
      const videoEl = document.getElementById(`remote-video-${id}`);
      if (
        videoEl &&
        p.tracks.video &&
        p.tracks.video.state === 'playable' &&
        p.tracks.video.persistentTrack
      ) {
        videoEl.srcObject = new MediaStream([p.tracks.video.persistentTrack]);
      }

      const audioEl = document.getElementById(`remote-audio-${id}`);
      if (
        audioEl &&
        p.tracks.audio &&
        p.tracks.audio.state === 'playable' &&
        p.tracks.audio.persistentTrack
      ) {
        audioEl.srcObject = new MediaStream([p.tracks.audio.persistentTrack]);
      }
    });
  }, [remoteParticipants]);

  // Step 5: Leave meeting
  const leaveCall = () => {
    callRef.current?.leave();
    setJoined(false);
  };

  // Toggle Mic
  const toggleMic = () => {
    const enabled = !micEnabled;
    setMicEnabled(enabled);
    if (callRef.current) {
      callRef.current.setLocalAudio(enabled);
    }
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    }
  };

  // Toggle Camera
  const toggleCam = () => {
    const enabled = !camEnabled;
    setCamEnabled(enabled);

    if (callRef.current) {
      callRef.current.setLocalVideo(enabled);
      // Update local video display after toggling
      setTimeout(() => updateLocalVideo(callRef.current), 100);
    }

    if (!enabled) {
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localStream.removeTrack(videoTrack);
        }
      }
    } else {
      if (!joined) {
        // Only handle local stream if not joined yet
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((newStream) => {
            const newVideoTrack = newStream.getVideoTracks()[0];

            if (localStream) {
              localStream.addTrack(newVideoTrack);
            }

            setLocalStream((prev) => {
              const updatedStream = new MediaStream([
                ...prev.getAudioTracks(),
                newVideoTrack,
              ]);
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = updatedStream;
              }
              return updatedStream;
            });
          })
          .catch((err) => {
            console.error('Failed to re-enable camera:', err);
            alert('Could not turn the camera back on.');
          });
      }
    }
  };

  // Render Waiting Room or Video Call UI
  return (
    <div className="w-screen h-screen bg-gray-900">
      <div className="w-full h-full text-white flex flex-col items-center justify-center">
        {!joined ? (
          <div className="p-6 space-y-6 text-center">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className=" aspect-[4/3] w-[50%] h-auto bg-black rounded-lg object-cover mx-auto"
            />
            <div className="flex justify-center items-center gap-4">
              <button
                onClick={toggleMic}
                className="bg-gray-500 hover:bg-gray-800 p-6 rounded-full"
              >
                {micEnabled ? 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic-icon lucide-mic"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>
                : 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic-off-icon lucide-mic-off"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                }
              </button>
              <button
                onClick={toggleCam}
                className="bg-gray-500 hover:bg-gray-800 p-6 rounded-full"
              >
                {camEnabled ? 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-video-icon lucide-video"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                :  
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-video-off-icon lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/></svg>
                }
              </button>
              <button
                onClick={joinCall}
                className="bg-blue-500 hover:bg-blue-800 px-6 py-3 rounded text-lg font-bold"
                disabled={loading}
              >
                {!loading ? 'Join Conversation' : 'Loading...'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <div className="relative aspect-[4/3] w-[50%] bg-black rounded overflow-hidden">
                {Object.entries(remoteParticipants).map(([id, p]) => (
                  <div key={id} className="absolute inset-0">
                    <video
                      id={`remote-video-${id}`}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <audio id={`remote-audio-${id}`} autoPlay playsInline />
                  </div>
                ))}
              </div>

              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[4/3] w-[50%] bg-gray-800 rounded object-cover"
              />
            </div>

            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={toggleMic}
                className="bg-gray-500 hover:bg-gray-800 p-6 rounded-full"
              >
                {micEnabled ? 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic-icon lucide-mic"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>
                : 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic-off-icon lucide-mic-off"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                }
              </button>
              <button
                onClick={toggleCam}
                className="bg-gray-500 hover:bg-gray-800 p-6 rounded-full"
              >
                {camEnabled ? 
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-video-icon lucide-video"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                :  
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-video-off-icon lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/></svg>
                }
              </button>
              <button
                onClick={leaveCall}
                className="bg-red-500 hover:bg-red-800 px-6 py-3 rounded text-lg font-bold"
              >
                End Call
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;