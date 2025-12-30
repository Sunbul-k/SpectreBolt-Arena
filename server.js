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
let bots = {};
let botLastShot = {}; // To prevent bots from firing too fast
let matchTime = 15 * 60; // 15 minutes in seconds

const walls = [
    { x: -500, y: -200, w: 300, h: 40 },
    { x: 200, y: 300, w: 40, h: 300 },
    { x: -1000, y: 600, w: 600, h: 40 }
];

function collidesWithWall(x, y, radius = 20) {
    return walls.some(w =>
        x + radius > w.x &&
        x - radius < w.x + w.w &&
        y + radius > w.y &&
        y - radius < w.y + w.h
    );
}

io.on('connection', (socket) => {
    console.log('A sniper has entered the arena!');

    socket.on('joinGame', (data) => {
        players[socket.id] = { 
            x: 0, 
            y: 0, 
            angle: 0, 
            color: Object.keys(players).length === 0 ? 'blue' : 'red',
            health: 100,
            score: 0,
            lives: 3, 
            name: data.name || "Player"
        };
        socket.emit('currentPlayers', players);
        socket.emit('botUpdate', bots);
        socket.broadcast.emit('newPlayer', { id: socket.id, playerInfo: players[socket.id] });
    }); 

    socket.on('move', (movementData) => {
        if (players[socket.id] && players[socket.id].lives > 0) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].angle = movementData.angle;
            socket.broadcast.emit('enemyMoved', { 
                id: socket.id, x: movementData.x, y: movementData.y, angle: movementData.angle 
            });
        }
    });

    socket.on('shoot', (bulletData) => {
        if (players[socket.id] && players[socket.id].lives > 0) {
            socket.broadcast.emit('enemyShoot', bulletData);
        }
    });

    socket.on('playerHit', (targetId) => {
        let shooter = players[socket.id];
        let target = players[targetId] || bots[targetId];

        if (shooter && target && (target.lives > 0 || bots[targetId])) {
            let damage = bots[targetId] ? 15 : 10;
            target.health -= damage;
            
            if (target.health <= 0) {
                target.health = 0;
                shooter.score += 1;
                io.emit('killEvent', { killer: shooter.name, victim: target.name });

                if (bots[targetId]) {
                    bots[targetId].health = 100;
                    bots[targetId].x = 0; 
                    bots[targetId].y = 0;
                } else {
                    target.lives -= 1;
                    if (target.lives > 0) {
                        target.health = 100;
                        target.x = 0;
                        target.y = 0;
                        io.to(targetId).emit('respawn', { x: 0, y: 0 });
                    } else {
                        io.to(targetId).emit('gameOver', { 
                            message: "OUT OF LIVES - SPECTATING", 
                            winnerColor: "red" 
                        });
                    }
                }
            }
            io.emit('updateStats', {
                id: targetId,
                health: target.health,
                lives: target.lives, 
                shooterId: socket.id,
                score: shooter.score
            });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Bot Logic
function spawnBot(id) {
    bots[id] = { x: 500, y: 500, angle: 0, health: 100, color: 'green', name: "CombatBot_" + id.split('_')[1] };
    botLastShot[id] = 0;
}
spawnBot('bot_1');

setInterval(() => {
    let now = Date.now();
    Object.keys(bots).forEach(botId => {
        let bot = bots[botId];
        let target = null;
        let minDist = Infinity;
        
        Object.keys(players).forEach(pId => {
            let p = players[pId];
            if (p.lives <= 0) return; // Don't target dead players
            let d = Math.sqrt((p.x - bot.x)**2 + (p.y - bot.y)**2);
            if (d < minDist) { minDist = d; target = p; }
        });

        if (target) {
            bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
            const botMoveSpeed = 10; // Slightly slower than player max for fairness

            if (minDist > 150) {
                let nextX = bot.x + Math.cos(bot.angle) * botMoveSpeed;
                let nextY = bot.y + Math.sin(bot.angle) * botMoveSpeed;
                
                if (!collidesWithWall(nextX, nextY)) {
                    bot.x = nextX;
                    bot.y = nextY;
                }
            }

            if (Math.random() < 0.15 && now - botLastShot[botId] > 1000) {
                botLastShot[botId] = now;
                io.emit('enemyShoot', { 
                    x: bot.x, 
                    y: bot.y, 
                    angle: bot.angle, 
                    speed: 700, 
                    timer: 2 
                });
            }
        }
    });
    io.emit('botUpdate', bots);
}, 50);

setInterval(() => {
    if (matchTime > 0) {
        matchTime--;
    } else {
        // End of match logic
        let winner = "NO ONE";
        let maxScore = -1;
        
        Object.values(players).forEach(p => {
            if (p.score > maxScore) {
                maxScore = p.score;
                winner = p.name;
            }
        });

        io.emit('gameOver', { 
            message: `MATCH OVER! ${winner} WINS!`, 
            winnerColor: "#00ff44" 
        });

        // Reset match
        matchTime = 15 * 60;
        Object.values(players).forEach(p => {
            p.score = 0;
            p.lives = 3;
            p.health = 100;
        });
    }
    io.emit('timerUpdate', matchTime);
}, 1000);

http.listen(PORT, () => { console.log(`SniArena live at PORT ${PORT}`); });