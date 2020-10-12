// getting dom elements
var divSelectRoom = document.getElementById("selectRoom");
var divConsultingRoom = document.getElementById("consultingRoom");
var inputRoomNumber = document.getElementById("roomNumber");
var btnGoRoom = document.getElementById("goRoom");
var localVideo = document.getElementById("localVideo");
var remoteVideo = document.getElementById("remoteVideo");

var divDebuggingInfo = document.getElementById("debuggingInfo");
var divServerStatus = document.getElementById("serverStatus");
var divPeerStatus = document.getElementById("peerStatus");
var btnPingServer = document.getElementById("pingServer");
var btnPingPeer = document.getElementById("pingPeer");

// variables
var roomNumber;
var localStream;
var remoteStream;
var rtcPeerConnection;
var debugDataChannel;
var iceServers = {
    'iceServers': [
        { 'urls': 'stun:stun.services.mozilla.com' },
        { 'urls': 'stun:stun.l.google.com:19302' }
    ]
}
var isVideo;
var isCaller;

var serverLatencyHistory = [];
var peerLatencyHistory = [];

// Let's do this
var socket = io();

btnGoRoom.onclick = function () {
    if (inputRoomNumber.value === '') {
        alert("Please type a room number")
    } else {
        isVideo = document.getElementById("hasVideo").checked;
        isDebug = document.getElementById("hasDebug").checked;
        console.log(isVideo);
        divSelectRoom.style = "display: none;";
        divConsultingRoom.style = "display: block;";
        
        if (inputRoomNumber.value === 'test') {
            socket.emit('join test room', socket.id);
            divDebuggingInfo.style = "display: block;";
        } else {
            roomNumber = inputRoomNumber.value;
            socket.emit('create or join', roomNumber);
        }
        
        if (isDebug) {
            divDebuggingInfo.style = "display: block;";
        }
    }
};

// message handlers
socket.on('created', function (room) {
    navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo }).then(function (stream) {
        localStream = stream;
        localVideo.srcObject = stream;
        isCaller = true;
    }).catch(function (err) {
        console.log('An error ocurred when accessing media devices', err);
    });
});

socket.on('joined', function (room) {
    navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo }).then(function (stream) {
        localStream = stream;
        localVideo.srcObject = stream;
        socket.emit('ready', roomNumber);
    }).catch(function (err) {
        console.log('An error ocurred when accessing media devices', err);
    });
});

socket.on('candidate', function (event) {
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate
    });
    rtcPeerConnection.addIceCandidate(candidate);
});

socket.on('ready', function () {
    if (isCaller) {
        rtcPeerConnection = new RTCPeerConnection(iceServers);
        rtcPeerConnection.onicecandidate = onIceCandidate;
        rtcPeerConnection.ontrack = onAddStream;
        openDataChannel();
        
        var tracks = localStream.getTracks()
        rtcPeerConnection.addTrack(tracks[0], localStream);
        if (tracks.length > 1) {
            // Send video if it exists
            rtcPeerConnection.addTrack(tracks[1], localStream);
        }
        rtcPeerConnection.createOffer()
            .then(sessionDescription => {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                socket.emit('offer', {
                    type: 'offer',
                    sdp: sessionDescription,
                    room: roomNumber
                });
            })
            .catch(error => {
                console.log(error)
            })
    }
});

socket.on('offer', function (event) {
    if (!isCaller) {
        rtcPeerConnection = new RTCPeerConnection(iceServers);
        rtcPeerConnection.onicecandidate = onIceCandidate;
        rtcPeerConnection.ontrack = onAddStream;
        rtcPeerConnection.ondatachannel = onDataChannel;
        var tracks = localStream.getTracks()
        rtcPeerConnection.addTrack(tracks[0], localStream);
        if (tracks.length > 1) {
            // Send video if it exists
            rtcPeerConnection.addTrack(tracks[1], localStream);
        }
        rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
        rtcPeerConnection.createAnswer()
            .then(sessionDescription => {
                rtcPeerConnection.setLocalDescription(sessionDescription);
                socket.emit('answer', {
                    type: 'answer',
                    sdp: sessionDescription,
                    room: roomNumber
                });
            })
            .catch(error => {
                console.log(error)
            })
    }
});

socket.on('answer', function (event) {
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
})

btnPingServer.onclick = function () {
    let currTime = Date.now().valueOf();
    socket.emit('pingTime', currTime);
};

socket.on('pongTime', function(pingTime) {
    let currTime = Date.now().valueOf();
    serverLatencyHistory.push(currTime - pingTime);
    divServerStatus.textContent = serverLatencyHistory;
})

btnPingPeer.onclick = function () {
    let currTime = Date.now().valueOf();
    debugDataChannel.send(JSON.stringify({
        "message": "ping",
        "timestamp": currTime
    }));
};

function openDataChannel() {
    debugDataChannel = rtcPeerConnection.createDataChannel("debug");
    debugDataChannel.onmessage = onMessage;
    debugDataChannel.onopen = handleChannelStatusChange;
    debugDataChannel.onclose = handleChannelStatusChange;
}

// handler functions
function onIceCandidate(event) {
    if (event.candidate) {
        console.log('sending ice candidate');
        socket.emit('candidate', {
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
            room: roomNumber
        })
    }
}

function onAddStream(event) {
    remoteVideo.srcObject = event.streams[0];
    remoteStream = event.stream;
}

function onDataChannel(event) {
    debugDataChannel = event.channel;
    debugDataChannel.onmessage = onMessage;
    debugDataChannel.onopen = handleChannelStatusChange;
    debugDataChannel.onclose = handleChannelStatusChange;
}

function handleChannelStatusChange(event) {
    if (debugDataChannel) {
        var state = debugDataChannel.readyState;
        console.log("Channel's status has changed to " + state)

        if (state === "open") {
            btnPingPeer.disabled = false;
        } else {
            btnPingPeer.disabled = true;
        }
    }
}

function onMessage(event) {
    const {message, timestamp, latency} = JSON.parse(event.data);
    if (message === "ping") {
        const currTime = Date.now().valueOf();
        debugDataChannel.send(JSON.stringify({
            "message": "pong",
            "latency": currTime - timestamp
        }));
    } else if (message === "pong") {
        peerLatencyHistory.push(latency);
        divPeerStatus.textContent = peerLatencyHistory;
    }
}
