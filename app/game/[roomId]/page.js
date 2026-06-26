// app/game/[roomId]/page.js
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
let socket;

export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId?.toUpperCase();
  
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [gameStatus, setGameStatus] = useState('lobby');
  const [myRole, setMyRole] = useState(null);
  const [myWord, setMyWord] = useState('');
  const [category, setCategory] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Office');
  const [difficulty, setDifficulty] = useState('EASY');
  const [result, setResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [nextRoundTime, setNextRoundTime] = useState(30);
  const [showConfirmVote, setShowConfirmVote] = useState(false);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mySocketId, setMySocketId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [myId, setMyId] = useState(null);
  const [voteCounts, setVoteCounts] = useState({});
  const [allVoted, setAllVoted] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [basePoints, setBasePoints] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [spyCount, setSpyCount] = useState(1);
  const [timeDuration, setTimeDuration] = useState(300);
  
  const [adminWords, setAdminWords] = useState({ normalWord: '', spyWord: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!socket) {
      socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
      
      socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id);
        setMySocketId(socket.id);
        setMyId(socket.id);
      });
      
      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
      });
    }
    
    return () => {};
  }, []);

  const compressImage = (file, maxWidth = 100, maxHeight = 100, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 100, 100, 0.7);
        setAvatar(compressed);
      } catch (error) {
        console.error(' Error compressing image:', error);
        alert('Error processing image');
      }
    }
  };

  const handleRoomState = useCallback((data) => {
    setPlayers(data.players || []);
    setHostId(data.hostId);
    setCurrentRound(data.currentRound || 1);
    setMaxRounds(data.maxRounds || 3);
    setGameStatus(data.status || 'lobby');
    setAllVoted(data.allVoted || false);
    setSpyCount(data.spyCount || 1);
    setTimeDuration(data.timeDuration || 300);
    
    if (data.isAdmin) {
      setIsAdmin(true);
    } else {
      const me = data.players?.find(p => p.id === socket.id);
      if (me) setMyScore(me.totalScore || 0);
    }
  }, []);

  const handleRoundStarted = useCallback((data) => {
    setGameStatus('playing');
    setCategory(data.category);
    setTimeRemaining(data.timeDuration || 300);
    setIsLoading(false);
    setResult(null);
    setVoteCounts({});
    setMyVote(null);
    setMaxRounds(data.maxRounds || 3);
    setBasePoints(data.basePoints || 0);
    setSpyCount(data.spyCount || 1);
    if (data.normalWord && data.spyWord) {
      setAdminWords({ normalWord: data.normalWord, spyWord: data.spyWord });
    }
  }, []);

  const handleYourRole = useCallback((data) => {
    setMyRole(data.role);
    setMyWord(data.word);
    setSpyCount(data.spyCount || 1);
  }, []);

  const handleRoundEnded = useCallback((data) => {
    setGameStatus('round-ended');
    setResult(data);
    setBasePoints(data.basePoints || 0);
    setSpyCount(data.spyCount || 1);
  }, []);

  const handleNextRoundReady = useCallback((data) => {
    setCurrentRound(data.currentRound);
    setMaxRounds(data.maxRounds || 3);
    setGameStatus('lobby');
    setResult(null);
    setMyRole(null);
    setMyWord('');
    setVoteCounts({});
    setMyVote(null);
    setAdminWords({ normalWord: '', spyWord: '' });
  }, []);

  const handleVoteUpdate = useCallback((data) => {
    setVoteCounts(data.voteCounts || {});
    setAllVoted(data.allVoted || false);
  }, []);

  const handleGameReset = useCallback((data) => {
    setCurrentRound(1);
    setMaxRounds(data?.maxRounds || 3);
    setGameStatus('lobby');
    setResult(null);
    setMyRole(null);
    setMyWord('');
    setVoteCounts({});
    setMyVote(null);
    setAdminWords({ normalWord: '', spyWord: '' });
    setBasePoints(0);
    setPlayers(prev => prev.map(p => ({ ...p, totalScore: 0 })));
  }, []);

  useEffect(() => {
    if (!isJoined || !socket || !roomId || !username) return;
    if (isListening) return;
    
    socket.off('room-state');
    socket.off('joined-success');
    socket.off('game-loading');
    socket.off('round-started');
    socket.off('your-role');
    socket.off('timer-update');
    socket.off('vote-update');
    socket.off('round-ended');
    socket.off('next-round-timer');
    socket.off('next-round-ready');
    socket.off('game-reset');

    socket.on('room-state', handleRoomState);
    socket.on('joined-success', (data) => {
      setIsAdmin(data?.isAdmin || false);
      if (data?.maxRounds) setMaxRounds(data.maxRounds);
      if (data?.spyCount) setSpyCount(data.spyCount);
      if (data?.timeDuration) setTimeDuration(data.timeDuration);
    });
    socket.on('game-loading', () => setIsLoading(true));
    socket.on('round-started', handleRoundStarted);
    socket.on('your-role', handleYourRole);
    socket.on('timer-update', (data) => setTimeRemaining(data.timeRemaining));
    socket.on('vote-update', handleVoteUpdate);
    socket.on('round-ended', handleRoundEnded);
    socket.on('next-round-timer', (data) => setNextRoundTime(data.time));
    socket.on('next-round-ready', handleNextRoundReady);
    socket.on('game-reset', handleGameReset);

    const joinData = { roomId, username, avatar: null, isAdmin: false };
    socket.emit('join-room', joinData);
    
    if (avatar) {
      const sendAvatar = () => {
        socket.emit('update-avatar', { roomId, avatar });
      };
      setTimeout(sendAvatar, 300);
      setTimeout(sendAvatar, 1000);
      setTimeout(sendAvatar, 2000);
    }
    
    setIsListening(true);
  }, [isJoined, roomId, username, avatar, isListening, handleRoomState, handleRoundStarted, handleYourRole, handleRoundEnded, handleNextRoundReady, handleVoteUpdate, handleGameReset]);

  const isGameOver = result?.isGameOver;
  const sortedPlayers = [...players].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

  const handleJoin = () => {
    if (username.trim()) setIsJoined(true);
    else alert('Please enter your name');
  };

  const handleStartRound = () => {
    socket.emit('start-round', { roomId, category: selectedCategory, difficulty });
  };

  const handleNextRound = () => {
    socket.emit('start-next-round', { roomId });
  };

  const handleProceed = () => {
    socket.emit('end-voting', { roomId });
  };

  const handleResetGame = () => {
    router.push('/');
  };

  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const confirmVote = () => {
    if (selectedVoteTarget) {
      socket.emit('cast-vote', { roomId, targetId: selectedVoteTarget });
      setMyVote(selectedVoteTarget);
      setShowConfirmVote(false);
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (name) => name ? name.charAt(0).toUpperCase() : '?';

  const getWordImageUrl = (word) => {
    if (!word) return '';
    const prompt = `${word}, simple icon style, clean background, high quality`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&nologo=true&seed=${word.length}`;
  };

  const AvatarDisplay = ({ player, size = 40, border = '2px solid rgba(255,255,255,0.3)', glow = false }) => (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: border,
      overflow: 'hidden',
      background: player?.avatar ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${Math.floor(size / 2.5)}px`,
      fontWeight: 'bold',
      color: 'white',
      boxShadow: glow ? '0 0 15px rgba(251, 191, 36, 0.5)' : 'none',
      flexShrink: 0
    }}>
      {player?.avatar ? (
        <img src={player.avatar} alt={player.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        getInitials(player?.username || '?')
      )}
    </div>
  );

  if (!socket || !mySocketId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: 'white', fontSize: '18px', padding: '20px', textAlign: 'center' }}>
        Connecting to server...
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', padding: '20px' }}>
        <div style={{ background: '#2d2d44', padding: isMobile ? '24px' : '32px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '8px', fontSize: isMobile ? '18px' : '20px' }}>
            Join Room: <span style={{ color: '#a855f7' }}>{roomId}</span>
          </h2>
          <p style={{ color: '#9ca3af', textAlign: 'center', marginBottom: '20px', fontSize: '13px' }}>
            First player becomes the Admin 👑
          </p>
          
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div 
              onClick={() => fileInputRef.current?.click()}
              style={{ 
                width: isMobile ? '70px' : '80px', 
                height: isMobile ? '70px' : '80px', 
                borderRadius: '50%', 
                background: avatar ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 8px', cursor: 'pointer', border: '2px solid #a855f7',
                overflow: 'hidden', fontSize: isMobile ? '28px' : '32px', fontWeight: 'bold', color: 'white'
              }}
            >
              {avatar ? (
                <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getInitials(username || '?')
              )}
            </div>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              onChange={handleAvatarUpload} 
              style={{ display: 'none' }} 
            />
            <p style={{ color: '#9ca3af', fontSize: '11px', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
              Click to upload avatar
            </p>
          </div>

          <input 
            type="text" 
            placeholder="Enter your name" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && handleJoin()}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#1a1a2e', border: '1px solid #4a4a6a', color: 'white', marginBottom: '16px', fontSize: '14px', textAlign: 'center', boxSizing: 'border-box' }} 
          />

          <button 
            onClick={handleJoin} 
            style={{ width: '100%', padding: '12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Enter Room
          </button>
        </div>
      </div>
    );
  }

  // ==================== ADMIN UI ====================
  if (isAdmin) {
    const normalPlayersOnly = players.filter(p => !p.isAdmin);
    
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', padding: isMobile ? '10px' : '16px', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          @keyframes shine { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
          @keyframes championPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
          @keyframes crownFloat { 0%, 100% { transform: translateX(-50%) translateY(0) rotate(-3deg); } 50% { transform: translateX(-50%) translateY(-6px) rotate(3deg); } }
          @keyframes podiumSlide { 0% { transform: translateY(40px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes confettiFall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
          @keyframes slideUp { 0% { transform: translateY(20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.02); opacity: 0.9; } }
          
          .admin-grid {
            display: grid;
            gap: 16px;
            transition: all 0.3s ease;
          }
          @media (min-width: 768px) {
            .admin-grid { grid-template-columns: 1fr 1fr 1fr; }
          }
          @media (max-width: 767px) {
            .admin-grid { 
              grid-template-columns: 1fr;
            }
          }
          
          .podium-container {
            display: flex;
            justify-content: center;
            align-items: flex-end;
            gap: 12px;
            padding: 24px;
            min-height: 280px;
          }
          @media (max-width: 767px) {
            .podium-container {
              flex-direction: column;
              align-items: center;
              min-height: auto;
              padding: 16px;
              gap: 16px;
            }
            .podium-item {
              width: 100% !important;
              max-width: 280px !important;
            }
          }
          
          .vote-grid {
            display: grid;
            gap: 10px;
          }
          @media (min-width: 768px) {
            .vote-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
          }
          @media (max-width: 767px) {
            .vote-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 400px) {
            .vote-grid { grid-template-columns: 1fr; }
          }
        `}</style>

        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: isMobile ? '10px 12px' : '12px 16px', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '10px', border: '1px solid #eab308', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: isMobile ? '12px' : '14px', color: '#9ca3af' }}>Round</span>
            <span style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', color: '#eab308' }}>{currentRound}/{maxRounds}</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 'bold', color: '#eab308' }}>{username}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}> Admin</div>
            </div>
            <div style={{ 
              width: isMobile ? '36px' : '40px', 
              height: isMobile ? '36px' : '40px', 
              borderRadius: '50%', 
              background: avatar ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #eab308', fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold',
              overflow: 'hidden'
            }}>
              {avatar ? (
                <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getInitials(username)
              )}
            </div>
          </div>
        </div>

        <h1 style={{ textAlign: 'center', color: '#eab308', marginBottom: isMobile ? '16px' : '24px', fontSize: isMobile ? '22px' : '28px' }}>
          👑 Admin Dashboard
        </h1>

        {/* FINAL STANDINGS */}
        {isGameOver && result && (
          <div style={{ marginBottom: '24px', animation: 'slideUp 0.5s ease-out' }}>
            <h2 style={{ 
              fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', textAlign: 'center',
              background: 'linear-gradient(135deg, #eab308 0%, #f59e0b 50%, #eab308 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', animation: 'shine 3s linear infinite',
              marginBottom: '20px'
            }}>
              🏆 GAME OVER! 🏆
            </h2>
            
            <div className="podium-container" style={{ background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', borderRadius: '16px' }}>
              {isMobile && sortedPlayers[0] && (
                <div className="podium-item" style={{ 
                  width: '100%', maxWidth: '280px', padding: '20px',
                  background: 'linear-gradient(135deg, #eab308 0%, #f59e0b 50%, #eab308 100%)',
                  borderRadius: '16px', textAlign: 'center',
                  animation: 'championPulse 1.5s ease-in-out infinite',
                  boxShadow: '0 8px 32px rgba(234, 179, 8, 0.5)',
                  border: '3px solid #fbbf24', position: 'relative', zIndex: 10, order: -1
                }}>
                  <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', fontSize: '40px', animation: 'crownFloat 2s ease-in-out infinite' }}>👑</div>
                  <AvatarDisplay player={sortedPlayers[0]} size={50} border="3px solid #fbbf24" glow={true} />
                  <div style={{ fontSize: '48px', margin: '8px 0' }}>🥇</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '6px', color: 'white' }}>{sortedPlayers[0].username}</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>{sortedPlayers[0].totalScore || 0} pts</div>
                  <div style={{ marginTop: '10px', padding: '4px 10px', background: 'rgba(255,255,255,0.3)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', color: 'white', display: 'inline-block' }}>🎉 CHAMPION 🎉</div>
                </div>
              )}
              
              {sortedPlayers[1] && (
                <div className="podium-item" style={{ 
                  flex: 1, maxWidth: isMobile ? '280px' : '180px', padding: isMobile ? '16px' : '20px',
                  background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                  borderRadius: '12px', textAlign: 'center',
                  border: '2px solid #d1d5db',
                  opacity: 0.9
                }}>
                  <AvatarDisplay player={sortedPlayers[1]} size={isMobile ? 40 : 50} border="2px solid #d1d5db" />
                  <div style={{ fontSize: isMobile ? '36px' : '48px', margin: '6px 0' }}>🥈</div>
                  <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold', marginBottom: '4px', color: 'white' }}>{sortedPlayers[1].username}</div>
                  <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', color: '#fbbf24' }}>{sortedPlayers[1].totalScore || 0} pts</div>
                </div>
              )}
              
              {!isMobile && sortedPlayers[0] && (
                <div className="podium-item" style={{ 
                  flex: 1, maxWidth: '220px', padding: '24px',
                  background: 'linear-gradient(135deg, #eab308 0%, #f59e0b 50%, #eab308 100%)',
                  borderRadius: '16px', textAlign: 'center',
                  animation: 'championPulse 1.5s ease-in-out infinite, podiumSlide 0.8s ease-out 0s both',
                  boxShadow: '0 8px 32px rgba(234, 179, 8, 0.5), 0 0 60px rgba(234, 179, 8, 0.3)',
                  border: '3px solid #fbbf24', position: 'relative', zIndex: 10
                }}>
                  <div style={{ position: 'absolute', top: '-30px', left: '50%', transform: 'translateX(-50%)', fontSize: '48px', animation: 'crownFloat 2s ease-in-out infinite' }}></div>
                  <AvatarDisplay player={sortedPlayers[0]} size={60} border="3px solid #fbbf24" glow={true} />
                  <div style={{ fontSize: '64px', margin: '8px 0' }}>🥇</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px', color: 'white' }}>{sortedPlayers[0].username}</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{sortedPlayers[0].totalScore || 0} pts</div>
                  <div style={{ marginTop: '12px', padding: '6px 12px', background: 'rgba(255,255,255,0.3)', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', color: 'white' }}>🎉 CHAMPION 🎉</div>
                </div>
              )}
              
              {sortedPlayers[2] && (
                <div className="podium-item" style={{ 
                  flex: 1, maxWidth: isMobile ? '280px' : '180px', padding: isMobile ? '16px' : '20px',
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  borderRadius: '12px', textAlign: 'center',
                  border: '2px solid #fb923c',
                  opacity: 0.9
                }}>
                  <AvatarDisplay player={sortedPlayers[2]} size={isMobile ? 40 : 50} border="2px solid #fb923c" />
                  <div style={{ fontSize: isMobile ? '36px' : '48px', margin: '6px 0' }}>🥉</div>
                  <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold', marginBottom: '4px', color: 'white' }}>{sortedPlayers[2].username}</div>
                  <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', color: '#fbbf24' }}>{sortedPlayers[2].totalScore || 0} pts</div>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button onClick={handleResetGame} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)' }}>
                🏠 Back to Homepage
              </button>
            </div>

            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
              {[...Array(50)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', width: '10px', height: '10px',
                  background: ['#eab308', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'][Math.floor(Math.random() * 5)],
                  left: `${Math.random() * 100}%`, top: '-10px',
                  borderRadius: Math.random() > 0.5 ? '50%' : '0',
                  animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s both`
                }} />
              ))}
            </div>
          </div>
        )}
        
        <div className="admin-grid" style={{ flex: 1 }}>
          {/* COLUMN 1: Players List */}
          <div style={{ background: '#2d2d44', padding: isMobile ? '16px' : '20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: isMobile ? '16px' : '18px', color: '#eab308' }}>
              Players ({normalPlayersOnly.length}) • {spyCount} {spyCount > 1 ? 'Spies' : 'Spy'}
            </h2>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {normalPlayersOnly.map((p, index) => (
                <li key={p.id} style={{ 
                  background: '#1a1a2e', padding: isMobile ? '10px' : '12px', borderRadius: '8px', 
                  marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' 
                }}>
                  <AvatarDisplay player={p} size={isMobile ? 32 : 36} border="1px solid #a855f7" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {index + 1}. {p.username}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '11px' }}>
                      {p.role === 'SPY' && gameStatus === 'playing' ? '🕵️ SPY' : '👤 Normal'}
                    </div>
                  </div>
                  <div style={{ color: '#eab308', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px', flexShrink: 0 }}>
                    {p.totalScore || 0}
                  </div>
                </li>
              ))}
            </ul>
            {normalPlayersOnly.length === 0 && (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '16px', fontSize: '13px' }}>Waiting for players...</p>
            )}
          </div>

          {/* COLUMN 2: Game Controls */}
          <div style={{ background: '#2d2d44', padding: isMobile ? '16px' : '20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: isMobile ? '16px' : '18px', color: '#eab308' }}>Game Controls</h2>
            
            {gameStatus === 'lobby' && (
              <>
                <label style={{ display: 'block', marginBottom: '6px', color: '#9ca3af', fontSize: '12px' }}>Select Category:</label>
                <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ width: '100%', padding: '10px', background: '#1a1a2e', border: '1px solid #eab308', color: 'white', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', boxSizing: 'border-box' }}>
                  <option value="Office">🏢 Office</option>
                  <option value="Food">🍔 Food</option>
                  <option value="Travel">✈️ Travel</option>
                  <option value="Security">🔒 Security</option>
                </select>

                <label style={{ display: 'block', marginBottom: '6px', color: '#9ca3af', fontSize: '12px' }}>Select Difficulty:</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={{ width: '100%', padding: '10px', background: '#1a1a2e', border: '1px solid #eab308', color: 'white', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', boxSizing: 'border-box' }}>
                  <option value="EASY">🟢 Easy</option>
                  <option value="HARD">🟡 Hard</option>
                  <option value="PRO">🔴 Pro</option>
                </select>

                <button 
                  onClick={handleStartRound} 
                  disabled={normalPlayersOnly.length < 3 || isLoading}
                  style={{ width: '100%', padding: '12px', background: isLoading ? '#6b7280' : '#a855f7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
                >
                  {isLoading ? '🤖 AI Generating...' : `Start Round ${currentRound}/${maxRounds}`}
                </button>
                
                {normalPlayersOnly.length < 3 && (
                  <p style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>Need at least 3 players</p>
                )}

                <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#a855f7' }}>
                  📊 {normalPlayersOnly.length} players = {maxRounds} rounds • {spyCount} {spyCount > 1 ? 'Spies' : 'Spy'} • {formatTime(timeDuration)}
                </div>
              </>
            )}

            {gameStatus === 'playing' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: 'bold', color: timeRemaining < 60 ? '#ef4444' : 'white', marginBottom: '6px' }}>
                    ⏱️ {formatTime(timeRemaining)}
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: '13px' }}>
                    Round in progress • {spyCount} {spyCount > 1 ? 'Spies' : 'Spy'} hiding
                  </p>
                  {basePoints > 0 && (
                    <p style={{ color: '#eab308', fontSize: '12px', marginTop: '4px' }}>
                      💰 Base: {basePoints} pts | Spy escape: {basePoints * 2} pts
                    </p>
                  )}
                </div>

                {/* ✅ BACK TO HOME BUTTON */}
                <button 
                  onClick={handleBackToHome}
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontSize: '14px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    marginBottom: '16px',
                    boxShadow: '0 4px 12px rgba(107, 114, 128, 0.4)'
                  }}
                >
                  🏠 Back to Home
                </button>
                
                <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: isMobile ? '12px' : '16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #a855f7' }}>
                  <h3 style={{ margin: '0 0 12px', color: '#a855f7', textAlign: 'center', fontSize: '14px' }}>🔐 Secret Words</h3>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Normal Word:</div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', color: '#22c55e', textAlign: 'center', padding: '6px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '6px', wordBreak: 'break-word' }}>
                      {adminWords.normalWord || '...'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Spy Word:</div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', color: '#ef4444', textAlign: 'center', padding: '6px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', wordBreak: 'break-word' }}>
                      {adminWords.spyWord || '...'}
                    </div>
                  </div>
                </div>

                {/* ✅ REAL-TIME VOTING CHART */}
                {Object.keys(voteCounts).length > 0 && (
                  <div style={{ background: '#1a1a2e', padding: isMobile ? '12px' : '16px', borderRadius: '10px', marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 16px', color: '#a855f7', textAlign: 'center', fontSize: '14px' }}>
                      📊 Real-Time Voting ({Object.values(voteCounts).reduce((a,b) => a+b, 0)}/{normalPlayersOnly.length} votes)
                    </h3>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {normalPlayersOnly.map(player => {
                        const votes = voteCounts[player.id] || 0;
                        const totalVotes = Object.values(voteCounts).reduce((sum, v) => sum + v, 0);
                        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                        const isSpy = player.role === 'SPY';
                        
                        return (
                          <div key={player.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 'bold', color: isSpy ? '#ef4444' : 'white', fontSize: '14px' }}>
                                {player.username} {isSpy && '️'}
                              </span>
                              <span style={{ color: '#eab308', fontWeight: 'bold', fontSize: '14px' }}>
                                {votes} vote{votes !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ 
                              background: '#2d2d44', 
                              borderRadius: '8px', 
                              height: '32px', 
                              overflow: 'hidden',
                              border: isSpy ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(168, 85, 247, 0.2)'
                            }}>
                              <div style={{ 
                                width: `${percentage}%`,
                                background: isSpy 
                                  ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' 
                                  : 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                                height: '100%',
                                transition: 'width 0.5s ease',
                                borderRadius: '8px',
                                opacity: votes > 0 ? 1 : 0.3
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ✅ SCORING STRUCTURE */}
                <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #eab308' }}>
                  <h3 style={{ margin: '0 0 8px', color: '#eab308', textAlign: 'center', fontSize: '14px' }}>
                    💰 Scoring Structure
                  </h3>
                  <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                    <p style={{ margin: '4px 0' }}>✅ Vote for Spy: <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{basePoints} pts</span></p>
                    <p style={{ margin: '4px 0' }}>❌ Vote for Normal: <span style={{ color: '#ef4444', fontWeight: 'bold' }}>0 pts</span></p>
                    <p style={{ margin: '4px 0' }}>🕵️ Spy Escapes: <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{basePoints * 2} pts each</span></p>
                  </div>
                </div>

                {/* ✅ PROCEED BUTTON */}
                {allVoted && (
                  <button 
                    onClick={handleProceed}
                    style={{ 
                      width: '100%', 
                      padding: '14px', 
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      fontSize: '16px', 
                      fontWeight: 'bold', 
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                      animation: 'pulse 2s infinite'
                    }}
                  >
                    ✅ All Players Voted - Proceed to Results!
                  </button>
                )}
              </div>
            )}

            {gameStatus === 'round-ended' && result && (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ color: result.spyCaught ? '#22c55e' : '#ef4444', marginBottom: '12px', fontSize: isMobile ? '18px' : '20px' }}>
                  {result.spyCaught ? '🎉 Spy Caught!' : '🕵️ Spy Escaped!'}
                </h3>
                <div style={{ background: '#1a1a2e', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                  <p style={{ margin: '6px 0', fontSize: '13px', wordBreak: 'break-word' }}>
                    Normal Word: <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{result.normalWord}</span>
                  </p>
                  <p style={{ margin: '6px 0', fontSize: '13px', wordBreak: 'break-word' }}>
                    Spy Word: <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{result.spyWord}</span>
                  </p>
                  <p style={{ margin: '6px 0', color: '#a855f7', fontSize: '13px' }}>
                    {result.spyCount > 1 ? 'The Spies were:' : 'The Spy was:'} <span style={{ fontWeight: 'bold' }}>
                      {result.spyIds ? result.spyIds.map(id => players.find(p => p.id === id)?.username).join(', ') : players.find(p => p.id === result.spyId)?.username}
                    </span>
                  </p>
                </div>
                {!isGameOver && (
                  <button onClick={handleNextRound} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Next Round ({nextRoundTime}s)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* COLUMN 3: Game Info */}
          <div style={{ background: '#2d2d44', padding: isMobile ? '16px' : '20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: isMobile ? '16px' : '18px', color: '#eab308' }}>📋 Game Info</h2>
            
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ color: '#a855f7', marginBottom: '8px', fontSize: '14px' }}>Category</h3>
              <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold', color: 'white', textAlign: 'center', padding: '12px', background: '#1a1a2e', borderRadius: '8px' }}>
                {category || 'Not started'}
              </div>
            </div>

            <div>
              <h3 style={{ color: '#a855f7', marginBottom: '8px', fontSize: '14px' }}>How to Play</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                <li style={{ marginBottom: '6px' }}>1️⃣ Players get secret words</li>
                <li style={{ marginBottom: '6px' }}>2️⃣ {spyCount > 1 ? `${spyCount} players are SPY` : '1 player is the SPY'}</li>
                <li style={{ marginBottom: '6px' }}>3️⃣ Anyone can vote</li>
                <li style={{ marginBottom: '6px' }}>4️⃣ Vote for spy = {basePoints} pts</li>
                <li style={{ marginBottom: '6px' }}>5️⃣ Spy escapes = {basePoints * 2} pts</li>
                <li>6️⃣ Vote for normal = 0 pts</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ✅ COPYRIGHT SECTION */}
        <div style={{ 
          textAlign: 'center', 
          padding: '20px', 
          marginTop: '24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          color: '#6b7280',
          fontSize: '12px'
        }}>
          © 2026 Alven Oblefias. All rights reserved.
        </div>
      </div>
    );
  }

  // ==================== PLAYER UI ====================
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', padding: isMobile ? '10px' : '16px', color: 'white', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes shine { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
        @keyframes championPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        @keyframes crownFloat { 0%, 100% { transform: translateX(-50%) translateY(0) rotate(-3deg); } 50% { transform: translateX(-50%) translateY(-6px) rotate(3deg); } }
        @keyframes podiumSlide { 0% { transform: translateY(40px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes confettiFall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
        @keyframes slideUp { 0% { transform: translateY(20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.02); opacity: 0.9; } }
        
        .player-grid { display: grid; gap: 16px; }
        @media (min-width: 768px) { .player-grid { grid-template-columns: 1fr 2fr; } }
        @media (max-width: 767px) { 
          .player-grid { 
            grid-template-columns: 1fr;
          }
        }
        
        .vote-grid { display: grid; gap: 10px; }
        @media (min-width: 768px) { .vote-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); } }
        @media (max-width: 767px) { .vote-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 400px) { .vote-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: isMobile ? '10px 12px' : '12px 16px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '10px', border: '1px solid #a855f7', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: isMobile ? '12px' : '14px', color: '#9ca3af' }}>Round</span>
          <span style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 'bold', color: '#a855f7' }}>{currentRound}/{maxRounds}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 'bold', color: '#a855f7' }}>{username}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {myRole === 'SPY' ? '🕵️ Spy' : ' Player'}
            </div>
          </div>
          <div style={{ 
            width: isMobile ? '36px' : '40px', 
            height: isMobile ? '36px' : '40px', 
            borderRadius: '50%', 
            background: avatar ? 'none' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #a855f7', fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold',
            overflow: 'hidden'
          }}>
            {avatar ? (
              <img src={avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              getInitials(username)
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', flex: 1 }}>
        
        {/* FINAL STANDINGS */}
        {isGameOver && result && (
          <div style={{ marginBottom: '24px', animation: 'slideUp 0.5s ease-out' }}>
            <h2 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', textAlign: 'center', color: '#eab308', marginBottom: '20px' }}>
              🏆 GAME OVER! 🏆
            </h2>
            
            <div style={{ background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', borderRadius: '12px', padding: isMobile ? '12px' : '16px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
              {sortedPlayers.map((player, index) => {
                const isChampion = index === 0;
                return (
                  <div key={player.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: isMobile ? '12px 14px' : '16px 20px',
                    marginBottom: index < sortedPlayers.length - 1 ? '10px' : '0',
                    background: isChampion ? 'linear-gradient(135deg, #eab308 0%, #f59e0b 100%)' : 'rgba(26, 26, 46, 0.8)',
                    borderRadius: '10px',
                    border: isChampion ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
                    animation: isChampion ? 'championPulse 1.5s ease-in-out infinite' : 'none',
                    boxShadow: isChampion ? '0 4px 20px rgba(234, 179, 8, 0.5)' : 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    gap: '8px'
                  }}>
                    {isChampion && (
                      <div style={{ position: 'absolute', top: '-8px', right: '16px', fontSize: isMobile ? '24px' : '32px', animation: 'crownFloat 2s ease-in-out infinite' }}>👑</div>
                    )}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', zIndex: 1, flex: 1, minWidth: 0 }}>
                      <AvatarDisplay 
                        player={player} 
                        size={isChampion ? (isMobile ? 40 : 50) : (isMobile ? 32 : 40)}
                        border={isChampion ? '3px solid #fbbf24' : '2px solid rgba(255,255,255,0.3)'}
                        glow={isChampion}
                      />
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: isMobile ? '20px' : '24px', opacity: isChampion ? 1 : 0.6, flexShrink: 0 }}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: 'bold', color: isChampion ? 'white' : '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {player.username}
                          </div>
                          {isChampion && (
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', fontWeight: 'bold', marginTop: '2px' }}>
                              🎉 CHAMPION
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 'bold', color: isChampion ? 'white' : '#fbbf24', zIndex: 1, flexShrink: 0 }}>
                      {player.totalScore || 0}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
              {[...Array(50)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', width: '10px', height: '10px',
                  background: ['#eab308', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'][Math.floor(Math.random() * 5)],
                  left: `${Math.random() * 100}%`, top: '-10px',
                  borderRadius: Math.random() > 0.5 ? '50%' : '0',
                  animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s both`
                }} />
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button onClick={() => router.push('/')} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)' }}>
                 Back to Homepage
              </button>
            </div>
          </div>
        )}

        <div className="player-grid">
          {/* LEFT SIDEBAR */}
          <div style={{ background: '#2d2d44', padding: isMobile ? '16px' : '20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: isMobile ? '16px' : '18px' }}>Players ({players.length}) • {spyCount} {spyCount > 1 ? 'Spies' : 'Spy'}</h2>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
              {players.map((p) => (
                <li key={p.id} style={{ background: '#1a1a2e', padding: isMobile ? '8px' : '10px', borderRadius: '8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {p.id === myId ? (
                    <AvatarDisplay player={p} size={isMobile ? 28 : 32} border="1px solid #a855f7" />
                  ) : (
                    <div style={{
                      width: isMobile ? '28px' : '32px',
                      height: isMobile ? '28px' : '32px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'white',
                      border: '1px solid #a855f7',
                      flexShrink: 0
                    }}>
                      {getInitials(p.username)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '500', fontSize: isMobile ? '13px' : '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</div>
                  </div>
                  <span style={{ color: '#eab308', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px', flexShrink: 0 }}>{p.totalScore || 0}</span>
                </li>
              ))}
            </ul>

            {gameStatus === 'playing' && (
              <div style={{ textAlign: 'center', borderTop: '1px solid #4a4a6a', paddingTop: '16px' }}>
                <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: 'bold', color: timeRemaining < 60 ? '#ef4444' : 'white', marginBottom: '6px' }}>
                  ️ {formatTime(timeRemaining)}
                </div>
                <p style={{ color: '#9ca3af', fontSize: '12px' }}>
                  {myRole === 'SPY' ? 'Listening Phase' : 'Discussion & Voting'}
                </p>
              </div>
            )}

            {gameStatus !== 'lobby' && (
              <div style={{ textAlign: 'center', borderTop: '1px solid #4a4a6a', paddingTop: '16px', marginTop: '16px' }}>
                <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 6px 0' }}>Your Score</p>
                <p style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 'bold', color: '#eab308', margin: 0 }}>{myScore} pts</p>
              </div>
            )}
          </div>

          {/* CENTER: Game Area */}
          <div style={{ background: '#2d2d44', padding: isMobile ? '16px' : '20px', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minHeight: '400px' }}>
            {gameStatus === 'lobby' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#9ca3af', fontSize: isMobile ? '14px' : '16px', marginBottom: '12px' }}>Waiting for Admin to start...</p>
                  <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#a855f7' }}>
                    📊 {players.filter(p => !p.isAdmin).length} players = {maxRounds} rounds • {spyCount} {spyCount > 1 ? 'Spies' : 'Spy'} • {formatTime(timeDuration)}
                  </div>
                </div>
              </div>
            )}

            {gameStatus === 'playing' && (
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', marginBottom: '12px' }}>
                  Category: <span style={{ color: '#a855f7' }}>{category}</span>
                </h2>
                
                {/* Secret Word Card */}
                <div style={{ background: '#1a1a2e', padding: isMobile ? '16px' : '20px', borderRadius: '10px', border: '2px solid #a855f7', marginBottom: '20px' }}>
                  <p style={{ color: '#9ca3af', marginBottom: '12px', fontSize: '12px' }}>Your Secret Word:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: isMobile ? '160px' : '200px', 
                      height: isMobile ? '160px' : '200px', 
                      borderRadius: '10px', 
                      overflow: 'hidden',
                      border: '2px solid #a855f7',
                      boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
                      background: '#2d2d44',
                      position: 'relative'
                    }}>
                      <img 
                        src={getWordImageUrl(myWord)} 
                        alt={myWord}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                    <p style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: 'bold', color: '#a855f7', margin: '8px 0', wordBreak: 'break-word' }}>{myWord}</p>
                    <p style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', margin: 0 }}>
                      You are: <span style={{ color: myRole === 'SPY' ? '#ef4444' : '#22c55e' }}>{myRole}</span>
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '8px 0 0 0' }}>
                      {spyCount > 1 ? `There are ${spyCount} spies` : 'There is 1 spy'}
                    </p>
                  </div>
                </div>

                {/* ✅ REAL-TIME VOTING CHART - NOW VISIBLE IN PLAYER UI */}
                {Object.keys(voteCounts).length > 0 && (
                  <div style={{ background: '#1a1a2e', padding: isMobile ? '12px' : '16px', borderRadius: '10px', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 16px', color: '#a855f7', textAlign: 'center', fontSize: '14px' }}>
                       Real-Time Voting ({Object.values(voteCounts).reduce((a,b) => a+b, 0)}/{players.filter(p => !p.isAdmin).length} votes)
                    </h3>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {players.filter(p => !p.isAdmin).map(player => {
                        const votes = voteCounts[player.id] || 0;
                        const totalVotes = Object.values(voteCounts).reduce((sum, v) => sum + v, 0);
                        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                        
                        return (
                          <div key={player.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 'bold', color: 'white', fontSize: '14px' }}>
                                {player.username}
                              </span>
                              <span style={{ color: '#eab308', fontWeight: 'bold', fontSize: '14px' }}>
                                {votes} vote{votes !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ 
                              background: '#2d2d44', 
                              borderRadius: '8px', 
                              height: '32px', 
                              overflow: 'hidden',
                              border: '1px solid rgba(168, 85, 247, 0.2)'
                            }}>
                              <div style={{ 
                                width: `${percentage}%`,
                                background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                                height: '100%',
                                transition: 'width 0.5s ease',
                                borderRadius: '8px',
                                opacity: votes > 0 ? 1 : 0.3
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ✅ SCORING STRUCTURE - NOW VISIBLE IN PLAYER UI */}
                <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '12px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #eab308' }}>
                  <h3 style={{ margin: '0 0 8px', color: '#eab308', textAlign: 'center', fontSize: '14px' }}>
                    💰 Scoring Structure
                  </h3>
                  <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                    <p style={{ margin: '4px 0' }}>✅ Vote for Spy: <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{basePoints} pts</span></p>
                    <p style={{ margin: '4px 0' }}>❌ Vote for Normal: <span style={{ color: '#ef4444', fontWeight: 'bold' }}>0 pts</span></p>
                    <p style={{ margin: '4px 0' }}>🕵️ Spy Escapes: <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{basePoints * 2} pts each</span></p>
                  </div>
                </div>
                
                {myRole !== 'SPY' && (
                  <div>
                    <h3 style={{ margin: '0 0 12px', color: '#a855f7', textAlign: 'center', fontSize: isMobile ? '14px' : '16px' }}>
                      {myVote ? 'Change your vote:' : 'Vote who you think is the SPY:'}
                    </h3>
                    <div className="vote-grid">
                      {players.filter(p => p.id !== myId).map(player => {
                        const isVoted = myVote === player.id;
                        return (
                          <button
                            key={player.id}
                            onClick={() => {
                              socket.emit('cast-vote', { roomId, targetId: player.id });
                              setMyVote(player.id);
                            }}
                            style={{ 
                              padding: isMobile ? '10px' : '14px', 
                              background: isVoted ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: 'white', 
                              border: isVoted ? '2px solid #4ade80' : 'none', 
                              borderRadius: '8px', 
                              fontSize: isMobile ? '12px' : '14px', 
                              fontWeight: 'bold', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'all 0.3s ease',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isVoted && <span style={{ fontSize: '14px' }}>✓</span>}
                            {player.username}
                          </button>
                        );
                      })}
                    </div>
                    
                    {myVote && (
                      <p style={{ color: '#22c55e', marginTop: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                        ✓ Current vote: {players.find(p => p.id === myVote)?.username}
                      </p>
                    )}
                  </div>
                )}
                
                {myRole === 'SPY' && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: isMobile ? '16px' : '20px', borderRadius: '10px' }}>
                    <div style={{ fontSize: isMobile ? '28px' : '36px', marginBottom: '8px' }}>🕵️</div>
                    <h3 style={{ color: '#ef4444', margin: '0 0 6px 0', fontSize: isMobile ? '16px' : '18px' }}>
                      You are {spyCount > 1 ? 'one of the' : 'the'} SPY{spyCount > 1 ? 'S' : ''}!
                    </h3>
                    <p style={{ color: '#9ca3af', margin: 0, fontSize: '13px' }}>
                      Listen carefully and try to blend in.
                    </p>
                    <p style={{ color: '#ef4444', marginTop: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                      {spyCount > 1 ? `There are ${spyCount} spies total` : 'Stay hidden!'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {gameStatus === 'round-ended' && result && !isGameOver && (
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: result.spyCaught ? '#22c55e' : '#ef4444', marginBottom: '16px' }}>
                  {result.spyCaught ? '🎉 Spy Caught!' : '🕵️ Spy Escaped!'}
                </h2>
                <div style={{ background: '#1a1a2e', padding: isMobile ? '16px' : '20px', borderRadius: '10px', marginBottom: '20px' }}>
                  <p style={{ marginBottom: '8px', fontSize: '14px', wordBreak: 'break-word' }}>
                    Normal Word: <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '18px' }}>{result.normalWord}</span>
                  </p>
                  <p style={{ marginBottom: '8px', fontSize: '14px', wordBreak: 'break-word' }}>
                    Spy Word: <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '18px' }}>{result.spyWord}</span>
                  </p>
                  <p style={{ color: '#eab308', fontWeight: 'bold', fontSize: '16px', marginTop: '12px' }}>
                    {result.spyCount > 1 ? 'The Spies were:' : 'The Spy was:'} {result.spyIds ? result.spyIds.map(id => players.find(p => p.id === id)?.username).join(', ') : players.find(p => p.id === result.spyId)?.username}
                  </p>
                </div>
                <p style={{ color: '#9ca3af', fontSize: '16px' }}>
                  Next round in <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{nextRoundTime}s</span>...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ COPYRIGHT SECTION */}
      <div style={{ 
        textAlign: 'center', 
        padding: '20px', 
        marginTop: '24px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        color: '#6b7280',
        fontSize: '12px'
      }}>
        © 2026 Alven Oblefias. All rights reserved.
      </div>

      {showConfirmVote && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#2d2d44', padding: '24px', borderRadius: '12px', maxWidth: '360px', width: '100%', border: '1px solid #a855f7' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', textAlign: 'center', marginBottom: '12px' }}>⚠️ Confirm Vote?</h3>
            <p style={{ color: '#d1d5db', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>
              Voting for <br/>
              <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '20px' }}>
                {players.find(p => p.id === selectedVoteTarget)?.username}
              </span>
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowConfirmVote(false)} style={{ flex: 1, padding: '10px', background: '#4b5563', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={confirmVote} style={{ flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}