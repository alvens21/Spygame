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

function getTimeDuration(playerCount) {
  if (playerCount <= 5) return 3 * 60;
  if (playerCount <= 10) return 6 * 60;
  if (playerCount <= 15) return 8 * 60;
  if (playerCount <= 20) return 10 * 60;
  if (playerCount <= 30) return 15 * 60;
  if (playerCount <= 40) return 20 * 60;
  if (playerCount <= 50) return 25 * 60;
  return 30 * 60;
}

function getBasePoints(currentRound, isSpy = false) {
  if (isSpy) {
    if (currentRound === 1) return 6;
    if (currentRound === 2) return 12;
    return 24;
  } else {
    if (currentRound === 1) return 2;
    if (currentRound === 2) return 4;
    return 8;
  }
}

function getEarlyVotingBonus(round, position, totalPlayers) {
  const isBelow5Players = totalPlayers < 5;
  
  if (round === 1) {
    if (position === 0) return 3;
    if (position === 1) return 2;
    if (position === 2) return isBelow5Players ? 0 : 1;
    return 0;
  } else if (round === 2) {
    if (position === 0) return 6;
    if (position === 1) return 4;
    if (position === 2) return isBelow5Players ? 1 : 2;
    return 0;
  } else {
    if (position === 0) return 12;
    if (position === 1) return 8;
    if (position === 2) return isBelow5Players ? 2 : 4;
    return 0;
  }
}

async function generateWordsWithAI(category, difficulty, usedWords = []) {
  console.log(` Generating AI words for: ${category} - ${difficulty}`);
  
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
- Words must be in ENGLISH
- Topics should be FAMILIAR TO FILIPINOS
- Words must be VERY SIMILAR and HARD TO DISTINGUISH
- MUST BE DIFFERENT from previously used words${previousWordsText}

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
  const nonAdminPlayers = room.players.filter(p => !p.isAdmin);
  
  const playersWhoCanVote = nonAdminPlayers.filter(p => p.role === 'NORMAL');
  const playersWhoVotedCount = Object.keys(room.votes).length;
  
  const allNormalVoted = playersWhoCanVote.length > 0 && 
                         playersWhoCanVote.every(p => room.votes[p.id] !== undefined);
  
  console.log(`📊 Broadcast Room ${roomId}: ${playersWhoVotedCount}/${playersWhoCanVote.length} voted - All: ${allNormalVoted}`);
  
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
      allVoted: allNormalVoted
    });
  }
  
  nonAdminPlayers.forEach(player => {
    io.to(player.id).emit('room-state', {
      players: nonAdminPlayers.map(p => ({
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
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        players: [], 
        adminId: null,
        status: 'lobby', 
        votes: {}, 
        voteOrder: [],
        spyId: null,
        spyIds: [], 
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
      room.players[existingPlayerIndex].username = username;
      if (avatar) room.players[existingPlayerIndex].avatar = avatar;
    } else if (!room.adminId) {
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
    
    socket.join(roomId);
    broadcastRoomState(roomId);
    
    const isNowAdmin = socket.id === room.adminId;
    socket.emit('joined-success', { 
      roomId, 
      username,
      isAdmin: isNowAdmin,
      maxRounds: room.maxRounds
    });
  });

  socket.on('update-avatar', ({ roomId, avatar }) => {
    const room = rooms[roomId];
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.avatar = avatar;
      broadcastRoomState(roomId);
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
    const timeDuration = getTimeDuration(playerCount);

    console.log(`🎮 Starting Round ${room.currentRound}/${room.maxRounds}`);
    io.to(roomId).emit('game-loading', { 
      message: `🤖 AI is generating unique words... (Round ${room.currentRound}/${room.maxRounds})` 
    });

    try {
      const wordData = await generateWordsWithAI(category, difficulty, room.usedWords || []);

      if (!room.usedWords) room.usedWords = [];
      room.usedWords.push(wordData.normalWord, wordData.spyWord);
      if (room.usedWords.length > 20) {
        room.usedWords = room.usedWords.slice(-20);
      }

      room.status = 'playing';
      room.votes = {};
      room.voteOrder = [];
      room.currentWord = wordData;
      room.timeRemaining = timeDuration;

      const gamePlayers = room.players.filter(p => !p.isAdmin);
      const spyCount = playerCount > 10 ? 2 : 1;
      const shuffled = shuffleArray(gamePlayers);
      const spyIds = [];
      for (let i = 0; i < spyCount; i++) {
        spyIds.push(shuffled[i].id);
      }
      
      room.spyIds = spyIds;
      room.spyId = spyIds[0];
      
      console.log(`🕵️ NEW Spy(s): ${spyIds.length} spy(s) - IDs: ${spyIds.join(', ')}`);

      room.players.forEach(p => {
        if (p.isAdmin) { p.role = null; return; }
        p.role = spyIds.includes(p.id) ? 'SPY' : 'NORMAL';
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
        basePoints: getBasePoints(room.currentRound, false),
        timeRemaining: timeDuration
      });
      
    } catch (error) {
      console.error('❌ Failed to start round:', error.message);
      io.to(room.adminId).emit('game-error', { 
        message: `AI Error: ${error.message}` 
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
      console.log(`❌ SPY ${voter.username} tried to vote - BLOCKED!`);
      return;
    }

    console.log(`\n️ VOTE CAST:`);
    console.log(`   Voter: ${voter.username} (${socket.id})`);
    console.log(`   Target: ${room.players.find(p => p.id === targetId)?.username}`);
    
    voter.votedFor = targetId;
    room.votes[socket.id] = targetId;
    
    room.voteOrder = room.voteOrder.filter(v => v.voterId !== socket.id);
    room.voteOrder.push({
      voterId: socket.id,
      targetId: targetId,
      timestamp: Date.now()
    });

    room.voteOrder.sort((a, b) => a.timestamp - b.timestamp);

    const nonAdminPlayers = room.players.filter(p => !p.isAdmin);
    const normalPlayers = nonAdminPlayers.filter(p => p.role === 'NORMAL');
    
    const voteCounts = {};
    nonAdminPlayers.forEach(p => { voteCounts[p.id] = 0; });
    Object.values(room.votes).forEach(t => { 
      if (voteCounts[t] !== undefined) voteCounts[t]++; 
    });

    const allNormalVoted = normalPlayers.length > 0 && 
                           normalPlayers.every(p => {
                             const hasVoted = room.votes[p.id] !== undefined;
                             console.log(`   Player ${p.username} (${p.id}): ${hasVoted ? 'VOTED ✓' : 'NOT VOTED '}`);
                             return hasVoted;
                           });
    
    console.log(`\n VOTE STATUS:`);
    console.log(`   Total normal players: ${normalPlayers.length}`);
    console.log(`   Total votes: ${Object.keys(room.votes).length}`);
    console.log(`   All voted: ${allNormalVoted ? '✅ YES' : '❌ NO'}`);
    console.log(`   Vote counts:`, voteCounts);
    console.log('');

    if (room.adminId) {
      io.to(room.adminId).emit('vote-update', { 
        voteCounts, 
        allVoted: allNormalVoted 
      });
    }
    
    normalPlayers.forEach(player => {
      io.to(player.id).emit('vote-update', { 
        voteCounts,
        allVoted: allNormalVoted 
      });
    });
    
    broadcastRoomState(roomId);
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
    const spyIds = room.spyIds && room.spyIds.length > 0 ? room.spyIds : [room.spyId];
    const totalPlayers = playersOnly.length;
    
    const normalBasePoints = getBasePoints(room.currentRound, false);
    const spyBasePoints = getBasePoints(room.currentRound, true);

    console.log(`\n🏁 ========== ROUND ${room.currentRound} ENDED ==========`);
    console.log(`Total players: ${totalPlayers}, Normal: ${normalPlayers.length}, Spies: ${spyIds.length}`);

    const correctVoters = room.voteOrder
      .filter(vote => spyIds.includes(vote.targetId))
      .filter((vote, index, self) => 
        index === self.findIndex(v => v.voterId === vote.voterId)
      );

    console.log(`\n📊 Correct voters (in order):`);
    correctVoters.forEach((v, i) => {
      const voter = room.players.find(p => p.id === v.voterId);
      console.log(`   #${i + 1}: ${voter?.username}`);
    });

    const spyCaught = correctVoters.length > 0;

    if (spyCaught) {
      console.log(`\n✅ SPY CAUGHT! Awarding points...`);
      
      correctVoters.forEach((vote, index) => {
        const player = room.players.find(p => p.id === vote.voterId);
        if (!player) return;
        
        const bonusPoints = getEarlyVotingBonus(room.currentRound, index, totalPlayers);
        const totalPoints = normalBasePoints + bonusPoints;
        
        player.totalScore += totalPoints;
        
        console.log(`   ${player.username} (#${index + 1}): ${normalBasePoints} base + ${bonusPoints} bonus = ${totalPoints} pts`);
      });
      
      spyIds.forEach(spyId => {
        const spyPlayer = room.players.find(p => p.id === spyId);
        if (spyPlayer) {
          console.log(`   🕵️ Spy ${spyPlayer.username}: 0 pts (caught)`);
        }
      });
    } else {
      console.log(`\n️ SPY ESCAPED!`);
      
      spyIds.forEach(spyId => {
        const spyPlayer = room.players.find(p => p.id === spyId);
        if (spyPlayer) {
          spyPlayer.totalScore += spyBasePoints;
          console.log(`   🕵️ Spy ${spyPlayer.username}: ${spyBasePoints} pts (escaped)`);
        }
      });
      
      normalPlayers.forEach(p => {
        console.log(`   ${p.username}: 0 pts (spy escaped)`);
      });
    }
    
    console.log(`========================================\n`);

    const isGameOver = room.currentRound >= room.maxRounds;

    io.to(roomId).emit('round-ended', {
      spyId: room.spyId, 
      spyIds: spyIds,
      spyCaught, 
      normalWord: room.currentWord.normalWord, 
      spyWord: room.currentWord.spyWord,
      isGameOver, 
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      basePoints: normalBasePoints,
      spyEscapePoints: spyBasePoints
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