const port = 36672;
const io = require('socket.io').listen(port);
console.log('Start socket.io port ' + port);
const Users = {};

io.sockets.on('connection', function (socket) {
    socket.on('address', address => {
        socket.address = address;
        Users[address] = socket;
    });

    socket.on('msg', (msg) => {
        console.info(socket.address || 'new Socket', ': ', msg);
    });

    socket.on('disconnect', () => {
        console.log(socket.address + ' disconnect');
        delete Users[socket.address];
    })
});

module.exports = (type, t) => {
    try {
        const recip = Users[t.recipientId];
        const sender = Users[t.senderId];

        if (recip) recip.emit(type, t);
        if (sender) sender.emit(type, t);
    } catch (e) {
        console.log('Socket error emit');
    }
}