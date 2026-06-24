// components/VotingChart.js
'use client';
import { useEffect, useState } from 'react';

export default function VotingChart({ roomId, players, socket, onVoteClick, myId }) {
  const [voteCounts, setVoteCounts] = useState({});
  const [voters, setVoters] = useState([]);

  useEffect(() => {
    socket.on('vote-update', (data) => {
      setVoteCounts(data.voteCounts || {});
      setVoters(data.voters || []);
    });
    return () => { socket.off('vote-update'); };
  }, [socket]);

  return (
    <div style={{
      background: '#1a1a2e',
      padding: '20px',
      borderRadius: '12px'
    }}>
      <h3 style={{ 
        fontSize: '20px',
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        📊 Live Voting
      </h3>
      
      {/* Vote buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {players.filter(p => p.id !== myId).map(p => (
          <button 
            key={p.id} 
            onClick={() => onVoteClick(p.id)}
            style={{
              padding: '14px',
              background: '#4b5563',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#6b7280'}
            onMouseLeave={(e) => e.target.style.background = '#4b5563'}
          >
            Vote {p.username}
          </button>
        ))}
      </div>

      {/* Vote counts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px'
      }}>
        {players.map(p => (
          <div key={p.id} style={{
            background: '#2d2d44',
            padding: '10px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: '500' }}>{p.username}</span>
            <span style={{
              background: '#a855f7',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '12px',
              fontWeight: 'bold',
              fontSize: '14px'
            }}>
              {voteCounts[p.id] || 0} votes
            </span>
          </div>
        ))}
      </div>

      {/* Voter status */}
      <div style={{
        marginTop: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px'
      }}>
        {players.map(p => {
          const hasVoted = players.find(v => v.id === p.id && voters.find(s => s.id === p.id)?.voted);
          return (
            <div key={p.id} style={{
              padding: '8px',
              borderRadius: '8px',
              fontSize: '14px',
              background: hasVoted ? 'rgba(34, 197, 94, 0.2)' : '#2d2d44',
              color: hasVoted ? '#22c55e' : '#9ca3af'
            }}>
              {p.username} {hasVoted ? '✓' : '○'}
            </div>
          );
        })}
      </div>
    </div>
  );
}