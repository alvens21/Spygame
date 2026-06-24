// app/page.js
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const [joinCode, setJoinCode] = useState('');
  const router = useRouter();

  const createRoom = () => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    router.push(`/game/${roomId}`);
  };

  const joinRoom = () => {
    if (joinCode.trim()) router.push(`/game/${joinCode.toUpperCase()}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-4">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-4xl font-bold mb-2">🕵️ Spy Game</h1>
        <p className="text-gray-400 mb-8">Find the spy before time runs out!</p>
        
        <button onClick={createRoom} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg mb-4 transition">
          Create New Room
        </button>
        
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Enter Room Code" 
            value={joinCode} 
            onChange={(e) => setJoinCode(e.target.value)}
            className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
            maxLength={6}
          />
          <button onClick={joinRoom} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition">
            Join
          </button>
        </div>
      </div>
    </main>
  );
}