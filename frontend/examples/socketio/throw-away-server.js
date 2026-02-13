// server.js
const express = require('express')
const http = require('node:http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public'))

const rooms = {}
// rooms[roomId] = { players: [{id, name, symbol}], board: Array(9).fill(null), turn: 'X' }

io.on('connection', socket => {
  console.log('User connected:', socket.id)

  socket.on('setUsername', username => {
    socket.data.username = username?.trim() || 'Guest'
    socket.emit('lobbyData', getLobbyData())
  })

  socket.on('createRoom', () => {
    const roomId = generateRoomId()
    rooms[roomId] = {
      players: [],
      board: Array(9).fill(null),
      turn: 'X',
    }
    io.emit('lobbyData', getLobbyData())
  })

  socket.on('joinRoom', roomId => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit('message', 'Room does not exist.')
      return
    }
    if (room.players.length >= 2) {
      socket.emit('message', 'Room is full.')
      return
    }

    const symbol = room.players.length === 0 ? 'X' : 'O'
    const player = {
      id: socket.id,
      name: socket.data.username || 'Guest',
      symbol,
    }
    room.players.push(player)

    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.symbol = symbol

    io.to(roomId).emit('startGame', {
      roomId,
      players: room.players,
      board: room.board,
      turn: room.turn,
    })

    io.emit('lobbyData', getLobbyData())
  })
  socket.on('makeMove', index => {
    const roomId = socket.data.roomId
    const room = rooms[roomId]
    if (!room) return

    const symbol = socket.data.symbol

    // Turn check
    if (room.turn !== symbol) return

    // Cell already filled?
    if (room.board[index] !== null) return

    // Apply move
    room.board[index] = symbol

    // Check for win or draw
    const winner = checkWinner(room.board)
    const isDraw = room.board.every(c => c !== null)

    if (winner) {
      io.to(roomId).emit('gameOver', {
        result: 'win',
        winner: winner,
      })
      return
    }

    if (isDraw) {
      io.to(roomId).emit('gameOver', {
        result: 'draw',
      })
      return
    }

    // Continue game
    room.turn = symbol === 'X' ? 'O' : 'X'
    io.to(roomId).emit('updateBoard', {
      board: room.board,
      turn: room.turn,
    })
  })

  socket.on('sendChat', msg => {
    const roomId = socket.data.roomId
    if (!roomId) return
    const name = socket.data.username || 'Guest'
    io.to(roomId).emit('chatMessage', {
      from: name,
      text: msg,
    })
  })

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
    const roomId = socket.data.roomId
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId]
      room.players = room.players.filter(p => p.id !== socket.id)
      if (room.players.length === 0) {
        delete rooms[roomId]
      } else {
        io.to(roomId).emit('message', 'Your opponent disconnected.')
      }
      io.emit('lobbyData', getLobbyData())
    }
  })
})

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase()
}

function getLobbyData() {
  return Object.entries(rooms).map(([id, room]) => ({
    id,
    players: room.players.map(p => p.name),
    slots: room.players.length,
  }))
}

function checkWinner(board) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // cols
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ]

  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] // "X" or "O"
    }
  }
  return null
}

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})
