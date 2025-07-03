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
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [localPreviewId, setLocalPreviewId] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
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

        setInWaitingRoom(true);

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
      }
    };

    init();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinCall = () => {
    const call = callRef.current;
    call.join({ url: roomUrl });
    setInWaitingRoom(false);
    const updateParticipants = () => {
      const allParticipants = call.participants();
      if (allParticipants.local) {
        setLocalPreviewId(allParticipants.local.user_id);
      }
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

  const WaitingRoom = () => {
    return (
      <div className="bg-gray-900 w-screen h-screen flex flex-col items-center justify-center h-full space-y-6">
        <h2 className="text-xl font-bold text-white text-center">Check your camera and mic<br />so our agent can see and hear you!</h2>
        <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video w-72">
          <video
            id={`my-video-preview`}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />       
        </div>
        <button
          onClick={handleJoinCall}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
        >
          Join Video Call
        </button>
      </div>
    );
  };

  if (inWaitingRoom) {
    return <WaitingRoom />;
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex flex-col justify-center items-center">
      <main className="flex flex-col gap-6">
        {Object.entries(participants).map(([id, p]) => (
          <div
            key={id}
            className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video w-[40dvw]"
          >
            <video
              id={`video-${id}`}
              autoPlay
              playsInline
              muted={id === "local"} 
              className="w-full h-full object-contain mx-auto"
            />
            {id !== "local" && (<audio id={`audio-${id}`} autoPlay playsInline />)}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
              <p id={`user-name-${id}`}></p>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default App;