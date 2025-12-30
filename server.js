/*
 * SniArena - 1v1 Sniper Game
 * Copyright (C) 2025 Saif Kayyali
 * Licensed under GNU GPLv3
 */

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let players = {};

// server.js correction
io.on('connection', (socket) => {
    console.log('A sniper has entered the arena!');
    
    // Initialize with all properties at once
    players[socket.id] = { 
        x: 400, 
        y: 300, 
        angle: 0, 
        color: socket.id === Object.keys(players)[0] ? 'blue' : 'red', // Dynamic color
        health: 100,
        score: 0 
    };
    
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, playerInfo: players[socket.id] });

    socket.on('move', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('enemyMoved', { 
                id: socket.id, 
                x: movementData.x, 
                y: movementData.y, 
                angle: movementData.angle 
            });
        }
    });

    socket.on('shoot', (bulletData) => {
        socket.broadcast.emit('enemyShoot', bulletData);
    });

    socket.on('playerHit', (targetId) => {
    if (players[targetId]) {
        players[targetId].health -= 10;
        
        // Check if THIS specific player died
        if (players[targetId].health <= 0) {
            players[targetId].health = 0; // Don't let it go negative
            players[socket.id].score += 1;
        }

        // Send updates to everyone
        io.emit('updateStats', {
            id: targetId,
            health: players[targetId].health,
            shooterId: socket.id,
            score: players[socket.id].score
        });

        // --- THE WIN CHECK ---
        let alivePlayers = Object.values(players).filter(p => p.health > 0);
        
        // If it's a 1v1 and only 1 player remains, or everyone is dead
        if (alivePlayers.length <= 1 && Object.keys(players).length > 1) {
            io.emit('gameOver', "Round Over!");
            
            setTimeout(() => {
                Object.keys(players).forEach(id => players[id].health = 100);
                // Send a full reset signal
                io.emit('currentPlayers', players);
            }, 3000);
        }
    }
});

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});
let bots = {};

// Function to spawn a bot
function spawnBot(id) {
    bots[id] = {
        x: Math.random() * 800,
        y: Math.random() * 600,
        angle: 0,
        health: 50,
        color: 'green',
        type: 'bot'
    };
}

// Initial bot
spawnBot('bot_1');

// Bot Logic Loop 
setInterval(() => {
    Object.keys(bots).forEach(botId => {
        let bot = bots[botId];
        
        // Find the nearest player to target
        let target = null;
        let minDist = Infinity;
        
        Object.keys(players).forEach(playerId => {
            let p = players[playerId];
            let dist = Math.sqrt((p.x - bot.x)**2 + (p.y - bot.y)**2);
            if (dist < minDist) {
                minDist = dist;
                target = p;
            }
        });

        if (target) {
            // Aim at target
            bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
            
            // Move toward target if too far away
            if (minDist > 200) {
                bot.x += Math.cos(bot.angle) * 2;
                bot.y += Math.sin(bot.angle) * 2;
            }

            // Randomly shoot
            if (Math.random() < 0.05) {
                io.emit('enemyShoot', { 
                    x: bot.x, y: bot.y, angle: bot.angle, speed: 10, timer: 100 
                });
            }
        }
    });

    // Tell all players where the bots are
    io.emit('botUpdate', bots);
}, 50);


http.listen(PORT, () => {
    console.log(`SniArena live at http://localhost:${PORT}`);
});