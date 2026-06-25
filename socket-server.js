// socket-server.js
require('dotenv').config();
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;

const io = new Server(PORT, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

const rooms = {};

function calculateMaxRounds(playerCount) {
  return Math.floor((playerCount - 1) / 5) + 3;
}

function getBasePoints(currentRound) {
  return currentRound * 2;
}

async function generateWordsWithAI(category, difficulty, usedWords = []) {
  console.log(`🤖 Generating AI words for: ${category} - ${difficulty}`);
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR')) {
    throw new Error('OpenAI API key not configured');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  const previousWordsText = usedWords.length > 0 
    ? `\n\nPREVIOUSLY USED WORDS (DO NOT REPEAT THESE):\n${usedWords.slice(-10).join(', ')}`
    : '';
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `Generate 2 CLOSELY RELATED words for a spy game.
          
Category: "${category}"
Difficulty: "${difficulty}"

CRITICAL RULES:
- Words must be in ENGLISH (not Tagalog)
- Topics should be FAMILIAR TO FILIPINOS (Philippines context)
- Words must be VERY SIMILAR and HARD TO DISTINGUISH
- Same category/type, similar function or purpose
- Common in Philippines daily life
- MUST BE DIFFERENT from previously used words${previousWordsText}
- Be CREATIVE and use UNIQUE pairs every time

Output ONLY JSON: {"normalWord": "word1", "spyWord": "word2"}`
        }],
        temperature: 1.0,
        max_tokens: 60
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    console.log('✅ AI Generated:', parsed);
    
    return {
      normalWord: parsed.normalWord,
      spyWord: parsed.spyWord,
      category: category
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ AI Generation FAILED:', error.message);
    throw error;
  }
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const allPlayers = room.players;
  const normalPlayers = room.players.filter(p => p.isAdmin !== true);
  
  console.log(`📢 Broadcasting room state for ${roomId}: ${allPlayers.length} total, ${normalPlayers.length} normal`);
  
  if (room.adminId) {
    io.to(room.adminId).emit('room-state', {
      players: allPlayers.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        totalScore: p.totalScore,
        role: p.role,
        isAdmin: p.isAdmin
      })),
      hostId: room.hostId,
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      status: room.status,
      isAdmin: true,
      allVoted: Object.keys(room.votes).length === normalPlayers.length && normalPlayers.length > 0
    });
  }
  
  normalPlayers.forEach(player => {
    io.to(player.id).emit('room-state', {
      players: normalPlayers.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        totalScore: p.totalScore
      })),
      hostId: room.hostId,
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      status: room.status,
      isAdmin: false
    });
  });
}

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-room', ({ roomId, username, avatar, isAdmin }) => {
    console.log(`🚪 ${username} joining room: ${roomId}`);
    console.log(`   - Avatar in join: ${avatar ? 'set' : 'null'}`);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        players: [], 
        adminId: null,
        status: 'lobby', 
        votes: {}, 
        voteOrder: [],
        spyId: null, 
        currentWord: null, 
        usedWords: [],
        hostId: null, 
        timer: null, 
        timeRemaining: 300, 
        currentRound: 1, 
        maxRounds: 3,
        nextRoundTimer: null, 
        nextRoundTimeRemaining: 30
      };
    }
    
    const room = rooms[roomId];
    
    const existingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (existingPlayerIndex !== -1) {
      console.log(`   - Updating existing player`);
      room.players[existingPlayerIndex].username = username;
      if (avatar) room.players[existingPlayerIndex].avatar = avatar;
    } else if (!room.adminId) {
      console.log(`   - First player! Becoming ADMIN 👑`);
      room.adminId = socket.id;
      room.hostId = socket.id;
      room.players.push({ 
        id: socket.id, 
        username, 
        avatar: avatar || null,
        isAdmin: true,
        role: null, 
        totalScore: 0, 
        votedFor: null 
      });
    } else {
      console.log(`   - Adding as normal player`);
      room.players.push({ 
        id: socket.id, 
        username, 
        avatar: avatar || null,
        isAdmin: false,
        role: 'NORMAL', 
        totalScore: 0, 
        votedFor: null 
      });
    }
    
    const playerCount = room.players.filter(p => !p.isAdmin).length;
    room.maxRounds = calculateMaxRounds(playerCount);
    console.log(`   - Player count: ${playerCount}, Max rounds: ${room.maxRounds}`);
    
    socket.join(roomId);
    console.log(`   - Socket joined room ${roomId}`);
    
    broadcastRoomState(roomId);
    
    const isNowAdmin = socket.id === room.adminId;
    console.log(`   - Sending joined-success to ${username} (isAdmin: ${isNowAdmin})`);
    socket.emit('joined-success', { 
      roomId, 
      username,
      isAdmin: isNowAdmin,
      maxRounds: room.maxRounds
    });
    
    console.log(`✅ ${username} successfully joined room ${roomId}\n`);
  });

  socket.on('update-avatar', ({ roomId, avatar }) => {
    console.log(`📸 Avatar update from ${socket.id} in room ${roomId}`);
    console.log(`   - Avatar length: ${avatar ? avatar.length : 0} chars`);
    
    const room = rooms[roomId];
    if (!room) {
      console.log(`   - ❌ Room not found`);
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.avatar = avatar;
      console.log(`   - ✅ Avatar updated for ${player.username}`);
      broadcastRoomState(roomId);
    } else {
      console.log(`   - ❌ Player not found in room`);
    }
  });

  socket.on('start-round', async ({ roomId, category, difficulty }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.adminId) return;
    
    const playerCount = room.players.filter(p => !p.isAdmin).length;
    if (playerCount < 3) {
      io.to(room.adminId).emit('game-error', { message: 'Need at least 3 players' });
      return;
    }

    room.maxRounds = calculateMaxRounds(playerCount);

    console.log(`🎮 Starting Round ${room.currentRound}/${room.maxRounds} - ${category} ${difficulty}`);
    io.to(roomId).emit('game-loading', { 
      message: `🤖 AI is generating unique words... (Round ${room.currentRound}/${room.maxRounds})` 
    });

    try {
      const wordData = await generateWordsWithAI(category, difficulty, room.usedWords || []);
      console.log('✅ Final words:', wordData);

      if (!room.usedWords) room.usedWords = [];
      room.usedWords.push(wordData.normalWord, wordData.spyWord);
      if (room.usedWords.length > 20) {
        room.usedWords = room.usedWords.slice(-20);
      }

      room.status = 'playing';
      room.votes = {};
      room.voteOrder = [];
      room.currentWord = wordData;
      room.timeRemaining = 300;

      const gamePlayers = room.players.filter(p => !p.isAdmin);
      
      // ✅ TRULY RANDOM SPY SELECTION - Walang pattern, walang bias
      // Shuffle the array first, then pick random index
      const shuffled = shuffleArray(gamePlayers);
      const randomIndex = Math.floor(Math.random() * shuffled.length);
      const spyPlayer = shuffled[randomIndex];
      
      room.spyId = spyPlayer.id;
      console.log(`🕵️ NEW Spy for Round ${room.currentRound}: ${spyPlayer.username} (chosen randomly from ${gamePlayers.length} players)`);

      room.players.forEach(p => {
        if (p.isAdmin) { p.role = null; return; }
        p.role = p.id === spyPlayer.id ? 'SPY' : 'NORMAL';
        p.votedFor = null;
      });

      room.players.forEach(p => {
        if (p.isAdmin) return;
        const word = p.role === 'SPY' ? room.currentWord.spyWord : room.currentWord.normalWord;
        io.to(p.id).emit('your-role', { 
          role: p.role, 
          word: word, 
          category: room.currentWord.category 
        });
      });

      if (room.timer) clearInterval(room.timer);
      room.timer = setInterval(() => {
        room.timeRemaining--;
        io.to(roomId).emit('timer-update', { timeRemaining: room.timeRemaining });
        if (room.timeRemaining <= 0) { 
          clearInterval(room.timer); 
          endRound(roomId); 
        }
      }, 1000);

      io.to(roomId).emit('round-started', { 
        category: room.currentWord.category, 
        currentRound: room.currentRound,
        maxRounds: room.maxRounds,
        normalWord: room.currentWord.normalWord,
        spyWord: room.currentWord.spyWord,
        basePoints: getBasePoints(room.currentRound)
      });
      
      console.log('📤 Sent to clients - Normal:', room.currentWord.normalWord, 'Spy:', room.currentWord.spyWord);
    } catch (error) {
      console.error('❌ Failed to start round:', error.message);
      io.to(room.adminId).emit('game-error', { 
        message: `AI Error: ${error.message}. Check terminal for details.` 
      });
      room.status = 'lobby';
      broadcastRoomState(roomId);
    }
  });

  socket.on('cast-vote', ({ roomId, targetId }) => {
    const room = rooms[roomId];
    const voter = room.players.find(p => p.id === socket.id && !p.isAdmin);
    if (!voter || room.status !== 'playing') return;
    
    if (voter.role === 'SPY') {
      console.log('❌ Spy cannot vote');
      return;
    }

    voter.votedFor = targetId;
    room.votes[socket.id] = targetId;
    
    room.voteOrder.push({
      voterId: socket.id,
      targetId: targetId,
      timestamp: Date.now()
    });

    const playersOnly = room.players.filter(p => !p.isAdmin);
    const normalPlayers = playersOnly.filter(p => p.role === 'NORMAL');
    
    const voteCounts = {};
    playersOnly.forEach(p => { voteCounts[p.id] = 0; });
    Object.values(room.votes).forEach(t => { 
      if (voteCounts[t] !== undefined) voteCounts[t]++; 
    });

    const allVoted = Object.keys(room.votes).length === normalPlayers.length && normalPlayers.length > 0;
    
    let unanimousVote = null;
    if (allVoted) {
      const firstVote = Object.values(room.votes)[0];
      if (Object.values(room.votes).every(v => v === firstVote)) {
        unanimousVote = firstVote;
      }
    }

    console.log(`📊 Votes: ${Object.keys(room.votes).length}/${normalPlayers.length} normal players voted`);

    if (room.adminId) {
      io.to(room.adminId).emit('vote-update', { 
        voteCounts, 
        unanimousVote, 
        allVoted 
      });
    }
    
    normalPlayers.forEach(player => {
      io.to(player.id).emit('vote-update', { 
        voteCounts,
        allVoted 
      });
    });
  });

  socket.on('end-voting', ({ roomId }) => endRound(roomId));

  function endRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;
    
    if (room.timer) { 
      clearInterval(room.timer); 
      room.timer = null; 
    }
    
    room.status = 'round-ended';

    const playersOnly = room.players.filter(p => !p.isAdmin);
    const normalPlayers = playersOnly.filter(p => p.role === 'NORMAL');
    const normalPlayerCount = normalPlayers.length;
    
    const voteCounts = {};
    playersOnly.forEach(p => { voteCounts[p.id] = 0; });
    Object.values(room.votes).forEach(t => { 
      if (voteCounts[t] !== undefined) voteCounts[t]++; 
    });
    
    let mostVotedId = null;
    let votingRule = '';
    
    if (normalPlayerCount === 2) {
      const votes = Object.values(room.votes);
      if (votes[0] === votes[1]) {
        mostVotedId = votes[0];
        votingRule = 'Unanimous (2 players)';
      } else {
        const firstVote = room.voteOrder[0];
        mostVotedId = firstVote ? firstVote.targetId : null;
        votingRule = 'First voter wins (2 players)';
      }
    } else {
      const sorted = Object.entries(voteCounts).sort((a,b) => b[1] - a[1]);
      mostVotedId = sorted[0]?.[0];
      votingRule = 'Majority rules';
    }
    
    const spyCaught = mostVotedId === room.spyId;

    const basePoints = getBasePoints(room.currentRound);
    const spyEscapePoints = basePoints * 2;
    
    console.log(`🏁 Round ${room.currentRound} ended - Base: ${basePoints}pts, Spy escape: ${spyEscapePoints}pts`);
    
    if (spyCaught) {
      const correctVoters = room.voteOrder
        .filter(v => v.targetId === room.spyId)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const totalCorrectVoters = correctVoters.length;
      
      correctVoters.forEach((vote, index) => {
        const player = room.players.find(p => p.id === vote.voterId);
        if (!player) return;
        
        const bonusPercentage = totalCorrectVoters > 1 
          ? ((totalCorrectVoters - 1 - index) / (totalCorrectVoters - 1)) * 100 
          : 100;
        
        const bonusPoints = (basePoints * bonusPercentage) / 100;
        const totalPoints = basePoints + bonusPoints;
        
        player.totalScore += Math.round(totalPoints);
        console.log(`📊 ${player.username} gets ${Math.round(totalPoints)} pts (${basePoints} base + ${Math.round(bonusPoints)} bonus)`);
      });
      
      const spyPlayer = room.players.find(p => p.id === room.spyId);
      if (spyPlayer) {
        console.log(`🕵️ Spy ${spyPlayer.username} gets 0 pts (caught)`);
      }
    } else {
      const spyPlayer = room.players.find(p => p.id === room.spyId);
      if (spyPlayer) {
        spyPlayer.totalScore += spyEscapePoints;
        console.log(`🕵️ Spy ${spyPlayer.username} gets ${spyEscapePoints} pts (escaped)`);
      }
      
      normalPlayers.forEach(p => {
        console.log(`📊 ${p.username} gets 0 pts (spy escaped)`);
      });
    }

    const isGameOver = room.currentRound >= room.maxRounds;

    io.to(roomId).emit('round-ended', {
      spyId: room.spyId, 
      spyCaught, 
      normalWord: room.currentWord.normalWord, 
      spyWord: room.currentWord.spyWord,
      isGameOver, 
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      basePoints: basePoints,
      spyEscapePoints: spyEscapePoints,
      votingRule: votingRule
    });
    
    broadcastRoomState(roomId);
  }

  socket.on('start-next-round', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.adminId) return;
    
    if (room.nextRoundTimer) { 
      clearInterval(room.nextRoundTimer); 
      room.nextRoundTimer = null; 
    }
    
    if (room.currentRound < room.maxRounds) {
      room.currentRound++;
      room.status = 'lobby';
      broadcastRoomState(roomId);
      io.to(roomId).emit('next-round-ready', { 
        currentRound: room.currentRound,
        maxRounds: room.maxRounds
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      if (!room) return;
      
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const wasAdmin = room.players[idx].isAdmin;
        room.players.splice(idx, 1);
        
        if (wasAdmin && room.adminId === socket.id) {
          room.adminId = null;
          room.hostId = null;
        }
      }
      
      const playerCount = room.players.filter(p => !p.isAdmin).length;
      if (playerCount >= 3) {
        room.maxRounds = calculateMaxRounds(playerCount);
      }
      
      if (room.players.length === 0 && !room.adminId) {
        if (room.timer) clearInterval(room.timer);
        if (room.nextRoundTimer) clearInterval(room.nextRoundTimer);
        delete rooms[roomId];
      } else {
        broadcastRoomState(roomId);
      }
    });
  });
});

console.log(`🚀 Socket Server running on port ${PORT}`);