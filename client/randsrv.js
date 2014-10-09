var RandHtml = require('./RandHtml');
var Http = require('http');

var server = function (req, res) {
    console.log(req.connection.remoteAddress + '  ' + req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    // lol
    res.write('<html><head>');
    var writeMoar = function () {
        for (;;) {
            var html = RandHtml.textToHtml(RandHtml.randomAscii(5000), true);
            html = html.substring(('<div>').length, html.length - ('</div>').length);
            if (!res.write(html)) { break; }
        }
    };
    res.on('drain', writeMoar);
    writeMoar();
};

Http.createServer(server).listen(1337, '::');
