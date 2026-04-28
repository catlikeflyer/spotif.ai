import { useState, useEffect, useRef } from 'react';
import { Send, Music, Loader2, PlayCircle, PauseCircle, SkipForward, SkipBack } from 'lucide-react';
import './index.css';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  toolCall?: {
    name: string;
    result: any;
  };
}

interface NowPlaying {
  is_playing: boolean;
  item: {
    name: string;
    artists: { name: string }[];
    album: {
      images: { url: string }[];
    };
  } | null;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'agent',
      text: 'Hello! I am your Spotify Agent. Ask me to play something, create a playlist, or tell you what is currently playing.',
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchNowPlaying = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/tools/getNowPlaying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.content && data.content[0] && data.content[0].text) {
        try {
          const text = data.content[0].text;
          // Only attempt to parse if it looks like JSON
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            const parsed = JSON.parse(text);
            setNowPlaying({
              is_playing: parsed.is_playing || false,
              item: parsed.item || null
            });
          } else {
            // It's a plain string message
            setNowPlaying(null);
          }
        } catch (e) {
          setNowPlaying(null);
        }
      }
    } catch (e) {
      console.error('Failed to fetch now playing', e);
    }
  };

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Create a simplified chat history for the LLM
      const history = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
      
      history.push({ role: 'user', content: userMessage.text });

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: history,
          model: 'gemma4:e2b'
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'err',
          sender: 'agent',
          text: `LLM Error: ${data.error}. Are you sure Ollama is running?`
        }]);
        return;
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'ans',
        sender: 'agent',
        text: data.message?.content || 'Done.',
        toolCall: data.toolCalls?.length > 0 ? { name: data.toolCalls.map(t=>t.name).join(', '), result: "executed" } : undefined
      }]);
      
      setTimeout(fetchNowPlaying, 1000);
      
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'err',
        sender: 'agent',
        text: 'Sorry, I encountered an error connecting to the backend or Ollama.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleControl = async (action: string) => {
    setIsLoading(true);
    try {
      await fetch(`http://localhost:3001/api/tools/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      setTimeout(fetchNowPlaying, 1000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Side Panel: Now Playing */}
      <div className="panel glass">
        <div className="header">
          <Music className="logo" size={32} />
          <h1>Spotify Agent</h1>
        </div>
        
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {nowPlaying?.item ? (
            <div className="now-playing">
              {nowPlaying.item.album.images[0] ? (
                <img src={nowPlaying.item.album.images[0].url} alt="Album Art" className="album-art" />
              ) : (
                <div className="album-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Music size={64} color="var(--text-subdued)" />
                </div>
              )}
              <div className="track-info">
                <h2>{nowPlaying.item.name}</h2>
                <p>{nowPlaying.item.artists.map(a => a.name).join(', ')}</p>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button onClick={() => handleControl('skipToPrevious')} disabled={isLoading} style={{ width: '40px', height: '40px', backgroundColor: 'transparent', color: 'white' }}>
                  <SkipBack size={24} />
                </button>
                <button onClick={() => handleControl(nowPlaying.is_playing ? 'pausePlayback' : 'resumePlayback')} disabled={isLoading}>
                  {nowPlaying.is_playing ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
                </button>
                <button onClick={() => handleControl('skipToNext')} disabled={isLoading} style={{ width: '40px', height: '40px', backgroundColor: 'transparent', color: 'white' }}>
                  <SkipForward size={24} />
                </button>
              </div>
            </div>
          ) : (
            <div className="now-playing" style={{ color: 'var(--text-subdued)' }}>
              <Music size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
              <p>Nothing is playing right now.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Panel: Chat */}
      <div className="panel glass chat-container">
        <div className="messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.sender}`}>
              <div className="message-header">
                {msg.sender === 'agent' ? 'Spotify Agent' : 'You'}
              </div>
              <div>{msg.text}</div>
              {msg.toolCall && (
                <div className="tool-call">
                  {'>'} executed {msg.toolCall.name}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message agent">
              <Loader2 className="animate-spin" size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command (e.g. 'Play Bohemian Rhapsody')"
            disabled={isLoading}
          />
          <button type="submit" disabled={!input.trim() || isLoading}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
