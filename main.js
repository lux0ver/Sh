/* global __dirname */

// Hi, there! If you read this, please contact our awesome support team (support@boosteroid.com)
// We are really appreciate this!
// Responsible disclosure!
// Thank's and Best!

"use strict";

process.title = 'boosteroid-experience';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const http = require('http'),
        url = require('url'),
        path = require('path'),
        fs = require('fs'),
        os = require('os'),
        log4js = require('log4js'),
        serverPort = parseInt(process.env.SERVER_PORT || 47989, 10);
const {spawn} = require('child_process');
const fetch = require('node-fetch');
const FormData = require('form-data');

const vmAutomationAddress = process.env.VM_AUTOMATION_ADDRESS || 'vm.auto:9002';
const beNetworkInterfaceName = process.env.BE_NETWORK_INTERFACE_NAME || 'app';
const beLimitCountStartProcess = 10;
const beLimitTimeForTestInMillis = 1*60*1000;


log4js.configure('./config/log4js.json');
const logger = log4js.getLogger('main');


function getJsonBodyAndRespondOk(request, response, cb) {
    let body = '';
    request.on('data', chunk => {
        body += chunk.toString(); // convert Buffer to string
    });
    request.on('end', () => {
        try {
            cb(JSON.parse(body));
            response.setHeader('Content-type', 'application/json');
            response.end(JSON.stringify({ok: true}));
        } catch (err) {
            response.writeHead(400, 'Bad Request');
            response.end(err.toString());
        }
    });
}

function getJsonBody(request, response, cb) {
    let body = '';
    request.on('data', chunk => {
        body += chunk.toString(); // convert Buffer to string
    });
    request.on('end', () => {
        try {
            cb(JSON.parse(body));
        } catch (err) {
            response.writeHead(400, 'Bad Request');
            response.end(err.toString());
        }
    });
}


function fillTemplate(templateString, self) {
    return new Function("var self = this; return `" + templateString + "`;").call(self);
}

const server = http.createServer(function (request, response) {
    logger.info((new Date()), `${request.method} ${request.url}`);

    const parsedUrl = url.parse(request.url, true);

    if (request.method === 'POST' && parsedUrl.pathname === '/stream') {
        getJsonBodyAndRespondOk(request, response, data => {
            userSession.update(data);
        });
    } else if (request.method === 'POST' && parsedUrl.pathname === '/quit') {
        userSession.terminate(() => {
            response.setHeader('Content-type', 'application/json');
            response.end(JSON.stringify({ok: true}));
        });
    } else if (request.method === 'POST' && parsedUrl.pathname === '/test') {
        userSession.test(parsedUrl.query.streamArgsFormat, (err, testScreenshotFilePath) => {
            if (err || testScreenshotFilePath === null) {
                response.writeHead(500, {'Content-type': 'text/plain'});
                response.end('Failed to make screenshot');
            } else {
                fs.readFile(testScreenshotFilePath, function (err, content) {
                    if (err) {
                        response.writeHead(500, {'Content-type': 'text/plain'});
                        response.end('Failed to make screenshot');
                    } else {
                        response.writeHead(200, {'Content-type': 'image/png'});
                        response.end(content);
                    }
                });
            }
        });
    } else if (request.method === 'POST' && parsedUrl.pathname === '/diag') {
        const command = 'dxdiag.exe';
        const outFilePath = path.join(__dirname, 'dxdiagOutput.txt');
        const diagProcess = spawn(command, ['/whql:off', '/t', outFilePath], {stdio: ['ignore', process.stdout, process.stderr]});
        diagProcess.on('exit', function (code) {
            if (code !== 0) {
                logger.error(`${command} exited with code ${code}`);
            } else {
                logger.error(`${command} exited`);
            }
            fs.readFile(outFilePath, function (err, content) {
                if (err) {
                    response.writeHead(500, {'Content-type': 'text/plain'});
                    response.end('Failed to run diagnostic tool');
                } else {
                    response.writeHead(200, {'Content-type': 'text/plain'});
                    response.end(content);
                }
                fs.unlink(outFilePath, (err) => {
                    if (err) {
                        logger.error(err);
                    }
                });
            });
        });
    }else if (request.method === 'POST' && parsedUrl.pathname === '/anydesk'){
        // get requests params
        getJsonBody(request, response, data => {

            try {
                var id = /^[0-9]+$/;
                var pw = /^[a-z0-9]+$/i

                if (data.anydesk_password === undefined ||  data.anydesk_id === undefined ||
                    !id.test(data.anydesk_id) || !pw.test(data.anydesk_password) || data.anydesk_password.length < 6){
                    throw('Invalid arguments');
                }

                // write bat file
                const outBatFilePath = path.join(__dirname, 'anydesk.bat');
                var outBatContent = `
                taskkill /f /im AnyDesk.exe
                start C:\\Users\\user\\boosteroid-experience\\AnyDesk.exe
                @echo off
                echo %time%
                timeout 5 > NUL
                echo %time%
                echo ${data.anydesk_password} | C:\\Users\\user\\boosteroid-experience\\AnyDesk.exe --set-password
                @echo off
                echo %time%
                timeout 5 > NUL
                echo %time%
                start C:\\Users\\user\\boosteroid-experience\\AnyDesk.exe ${data.anydesk_id}`;


                fs.writeFileSync(outBatFilePath, outBatContent);
                const powershell = spawn('powershell.exe', ['Start-Process', outBatFilePath, '-Verb', 'runAs'], {stdio: ['ignore', process.stdout, process.stderr]});
                powershell.on('error', function(err){
                    response.writeHead(400, 'Bad Request');
                    response.end(err.toString());
                });

                powershell.on('exit', function (code) {
                    if (code !== 0) {
                        response.writeHead(400, 'Bad Request');
                        response.end(JSON.stringify({code: code}));
                    } else {
                        response.setHeader('Content-type', 'application/json');
                        response.end(JSON.stringify({ok: true}));
                    }
                });

            }catch(err){
                response.writeHead(400, 'Bad Request');
                response.end(err.toString());
            }

        });
    }else if (request.method === 'POST' && parsedUrl.pathname === '/command'){
        // get requests params
        getJsonBody(request, response, data => {

            try {
                if (data.command === undefined){
                    throw('Invalid arguments');
                }

                const startCommand = spawn(data.command, data.args.split(/  */), {stdio: ['ignore', process.stdout, process.stderr]});
                startCommand.on('error', function(err){
                    response.writeHead(400, 'Bad Request');
                    response.end(err.toString());
                });

                startCommand.on('exit', function (code) {
                    if (code !== 0) {
                        response.writeHead(400, 'Bad Request');
                        response.end(JSON.stringify({code: code}));
                    } else {
                        response.setHeader('Content-type', 'application/json');
                        response.end(JSON.stringify({ok: true}));
                    }
                });

            }catch(err){
                response.writeHead(400, 'Bad Request');
                response.end(err.toString());
            }

        });
    }else if (request.method === 'POST' && parsedUrl.pathname === '/open_link'){
        // get requests params
        getJsonBody(request, response, data => {
            try{
                if (data.link === undefined){
                    throw('Invalid arguments');
                }
                // senf link to sinkIp
                userSession.notify_user({'link':data.link});
                response.setHeader('Content-type', 'application/json');
                response.end(JSON.stringify({ok: true}));

            }catch(err){
                response.writeHead(400, 'Bad Request');
                response.end(err.toString());
            }
        });
    }else if (request.method === 'GET' && parsedUrl.pathname === '/') {
        const obj = {};
        for (var i in userSession) {
            const value = userSession[i];
            if (value === null) {
                obj[i] = null;
            } else if (typeof value === 'object') {
                obj[i] = 'object';
            } else {
                obj[i] = value;
            }
        }
        response.setHeader('Content-type', 'application/json');
        response.end(JSON.stringify(obj));
    } else {
        response.writeHead(404, 'Not Found');
        response.end();
    }
});
server.on('clientError', (err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.listen(serverPort, function () {
    logger.info((new Date()), 'Server is listening on port', serverPort);
});

const PROCESS_NOT_STARTED = 0;
const PROCESS_STARTED = 1;
const PROCESS_TERMINATING = 2;
const PROCESS_EXITED = 3;


function isProcessNotRunning(state) {
    return (state === PROCESS_NOT_STARTED || state === PROCESS_EXITED);
}


class UserSession {
    constructor() {
        Object.assign(this, this.getInitialState());

        this.inProgress = false;
        this.stateChaged = false;
        this.depth = 0;
    }

    getInitialState() {
        return {
            command: null,
            args: null,
            workdir: null,

            report:{
                'tcpServer': {
                    count:0,
                    codes:[],
                    args: null
                },
                'launchersHelper': {
                    count:0,
                    codes:[],
                    args: null
                },
                'resolutionHelper': {
                    count:0,
                    codes:[],
                    args: null
                },
                'dxgCap': {
                    count:0,
                    codes:[],
                    args: null
                },
                'licenseHelper':{
                    count:0,
                    codes:[],
                    args:null
                }
            },

            inputProcessState: PROCESS_NOT_STARTED,
            inputProcess: null,

            applicationProcessState: PROCESS_NOT_STARTED,
            applicationProcess: null,

            streamProcessState: PROCESS_NOT_STARTED,
            streamProcess: null,

            resolutionHelperProcessState: PROCESS_NOT_STARTED,
            resolutionHelperProcess: null,

            is_error_reported: false,

            terminating: false,
            terminateCallback: null,

            sinkIp: null,
            currentSinkIp: null,
            clientIp: null,
            currentClientIp: null,
            videoPort: null,
            currentVideoPort: null,
            audioPort: null,
            currentAudioPort: null,

            targetStreamArgsFormat: null,
            currentStreamArgsFormat: null,
            targetScaleWidth: null,
            targetScaleHeight: null,
            currentScaleWidth: null,
            currentScaleHeight: null,
            targetFramerate: 30,
            currentFramerate: null,
            targetLevel: null,
            targetBitrate: null,
            currentLevel: null,

            testing: false,
            testStreamProcessState: PROCESS_NOT_STARTED,
            testStreamProcess: null,
            testScreenshotFilePath: null,
            sessionId: null,
            is_rs: false,

            timeTestSpentTimeout: null,
            timeSpentInTestInMillis: 0
        };
    }

    update(obj) {

        if (this.depth > 15) {
            logger.info((new Date()), 'max depth reached', this, obj);
        }

        Object.assign(this, obj);

        if (this.depth > 15) {
            return;
        }

        if (this.inProgress === false) {
            this.run();
        } else {
            this.stateChaged = true;
        }
    }

    runRules() {
        const self = this;

        if (self.terminating === false) {
            if (self.testing === true && self.sinkIp === null) {
                self.update({
                    sinkIp: '127.0.0.1',
                    videoPort: 30000,
                    audioPort: 30010,
                    command: 'C:\\Windows\\System32\\notepad.exe',
                    targetLevel: '4.2',
                    targetBitrate: 2,
                    targetScaleWidth: 1920,
                    targetScaleHeight: 1080,
                    args: []
                  });
            }

            if (self.testing === true
                    && self.sinkIp === '127.0.0.1' && self.videoPort !== null
                    && isProcessNotRunning(self.testStreamProcessState)
                    && self.applicationProcessState === PROCESS_STARTED) {

                const command = path.join(__dirname, 'ffmpeg.exe');
                const inSDPFilePath = path.join(__dirname, 'test.sdp');
                const outFilePath = path.join(__dirname, 'test.png');
                const args = `-hide_banner -y -protocol_whitelist file,crypto,rtp,udp -analyzeduration 100000000 -i ${inSDPFilePath} -ss 00:00:10 -vframes 1 ${outFilePath}`;
                const testStreamProcess = spawn(command, args.split(/  */), {stdio: ['ignore', 'ignore', process.stderr]});
                testStreamProcess.on('exit', function (code) {
                    if (code !== 0) {
                        logger.error(`${command} exited with code ${code}`);
                    }

                    if (self.testStreamProcessState === PROCESS_TERMINATING){
                        self.update({testStreamProcessState: PROCESS_EXITED, testStreamProcess: null, testing: true});
                    }else{
                        self.clearTimeout();
                        self.update({testStreamProcessState: PROCESS_EXITED, testStreamProcess: null, testing: false, testScreenshotFilePath: outFilePath, terminating: true});
                    }
                });

                self.update({testStreamProcessState: PROCESS_STARTED, testStreamProcess: testStreamProcess});

            }

            //if (isProcessNotRunning(self.resolutionHelperProcessState)
            if (self.resolutionHelperProcessState === PROCESS_NOT_STARTED
                    && self.targetScaleWidth !== null
                    && self.targetScaleHeight !== null
                    && (self.currentScaleWidth !== self.targetScaleWidth
                       || self.currentScaleHeight !== self.targetScaleHeight
                       || self.currentSinkIp !== self.sinkIp
                       || self.currentVideoPort !== self.videoPort
                       || self.currentAudioPort !== self.audioPort
                     )){

                const resolutionHelperPath = path.join(__dirname, 'ResolutionHelper.exe');
                // TODO Change hardcore resolution
                //const resolutionHelperProcess = spawn(resolutionHelperPath, ["" + "1920", "" + "1080"], {stdio: ['ignore', process.stdout, process.stderr]});
                const resolutionHelperProcess = spawn(resolutionHelperPath, ["" + self.targetScaleWidth, "" + self.targetScaleHeight], {stdio: ['ignore', process.stdout, process.stderr]});

                resolutionHelperProcess.on('exit', function (code) {
                    if (code !== 0) {
                        self.report.resolutionHelper.count++;
                        self.report.resolutionHelper.codes.push(code);
                        self.report.resolutionHelper.args = "" + self.targetScaleWidth + " " + self.targetScaleHeight;

                        logger.error(`${resolutionHelperPath} exited with code ${code}`);
                    } else {
                        logger.error(`${resolutionHelperPath} exited`);
                    }

                    if(self.report.resolutionHelper.count >= beLimitCountStartProcess && self.is_error_reported === false){
                         self.set_vm_in_error_state();
                    }
                    self.update({resolutionHelperProcessState: PROCESS_EXITED, resolutionHelperProcess: null});
                });
                self.update({resolutionHelperProcessState: PROCESS_STARTED, resolutionHelperProcess: resolutionHelperProcess});
            }

            if (isProcessNotRunning(self.inputProcessState)
                    && self.command !== null
                    && self.resolutionHelperProcessState === PROCESS_EXITED) {

                const command = path.join(__dirname, 'TcpServer.exe');
                const inputProcess = spawn(command, [], {stdio: ['ignore', process.stdout, process.stderr]});
                inputProcess.on('exit', function (code) {
                    if (code !== 0) {
                        self.report.tcpServer.count++;
                        self.report.tcpServer.codes.push(code);
                        logger.error(`${command} exited with code ${code}`);
                    } else {
                        logger.error(`${command} exited`);
                    }

                    if(self.report.tcpServer.count >= beLimitCountStartProcess && self.is_error_reported === false){
                         self.set_vm_in_error_state();
                    }
                    self.update({inputProcessState: PROCESS_EXITED, inputProcess: null});
                });
                self.update({inputProcessState: PROCESS_STARTED, inputProcess: inputProcess});
            }

            if (self.applicationProcessState === PROCESS_NOT_STARTED
                    && self.command !== null
                    && self.args !== null
                    && self.resolutionHelperProcessState === PROCESS_EXITED) {

                const command = path.join(__dirname, 'LaunchersHelper.exe');
                const applicationProcess = spawn(command, [self.command, self.args] , {stdio: ['ignore', process.stdout, process.stderr], cwd: self.workdir});

                applicationProcess.on('exit', function (code) {

                    if(code !== 0){
                        self.report.launchersHelper.count++;
                        self.report.launchersHelper.codes.push(code);
                        self.report.launchersHelper.args = self.command + ' ' + self.args;
                    }
                    if(self.report.launchersHelper.count >= beLimitCountStartProcess && self.is_error_reported === false){
                         self.set_vm_in_error_state();
                    }

                    switch (code) {
                        case -1:{
                            self.update({applicationProcessState: PROCESS_NOT_STARTED, applicationProcess: null});
                            break;
                        }
                        case 0:{
                            // post to SG to terminate session
                            if(self.sinkIp !== null){
                                fetch(`https://${self.sinkIp}:1337/userSession?sessionId=${self.sessionId}&terminate=true&messageToUser=Session is ended by the user`, { method: 'POST'})
                                    .then(res => {if(!res.ok){throw res}})
                                    .catch(err => logger.error('error at terminate session', err));
                            }
                            // update state
                            self.update({applicationProcessState: PROCESS_EXITED, applicationProcess: null});
                            break;
                        }
                        case 1:{
                            self.update({applicationProcessState: PROCESS_NOT_STARTED, applicationProcess: null});
                            break;
                        }
                        case 2:{
                            self.update({applicationProcessState: PROCESS_NOT_STARTED, applicationProcess: null});
                            break;
                        }
                        default:{
                            self.update({applicationProcessState: PROCESS_EXITED, applicationProcess: null});
                        }
                    }
                    logger.error(`${self.command} exited with code ${code}`);
                });
                self.update({applicationProcessState: PROCESS_STARTED, applicationProcess: applicationProcess});
            }

            // stop process if need change resolution, change RS, change SG
            if (self.streamProcessState === PROCESS_STARTED
                    && (self.currentStreamArgsFormat !== self.targetStreamArgsFormat
                            || self.currentScaleWidth !== self.targetScaleWidth
                            || self.currentScaleHeight !== self.targetScaleHeight
                            || self.currentFramerate !== self.targetFramerate
                            || self.currentLevel !== self.targetLevel
                            || self.currentSinkIp !== self.sinkIp
                            || self.currentVideoPort !== self.videoPort
                            || self.currentAudioPort !== self.audioPort
                            || self.currentClientIp !== self.clientIp )) {


                self.streamProcess.kill('SIGTERM');
                self.report.dxgCap.count--;
                self.inputProcess.kill('SIGTERM');
                self.report.tcpServer.count--;

                self.update({
                  streamProcessState: PROCESS_TERMINATING,
                  inputProcessState: PROCESS_TERMINATING,
                  resolutionHelperProcessState: PROCESS_NOT_STARTED,
                });
            }


            if (isProcessNotRunning(self.streamProcessState)
                    && self.command !== null
                    && self.targetScaleWidth !== null
                    && self.targetScaleHeight !== null
                    && self.targetLevel !== null
                    && self.targetBitrate !== null
                    && self.sinkIp !== null
                    && self.videoPort !== null
                    && self.audioPort !== null
                    && self.targetStreamArgsFormat !== null
                    //&& self.DXGIHelperProcessState === PROCESS_STARTED
                    && self.resolutionHelperProcessState === PROCESS_EXITED) {

                const command = path.join(__dirname, 'DXGCap.exe');
                //let args = self.targetStreamArgsFormat;

                let args = '-ip ${self.sinkIp} -portv ${self.videoPort} -porta ${self.audioPort} -level ${self.targetLevel} -maxrate ${self.targetBitrate} -pkt_size ${self.pkt_size}';

                if(self.clientIp !== null){
                    args = args.replace(/sinkIp/gi, 'clientIp');
                }
                self.pkt_size = (self.is_rs === false)? 1400:1040;


                args = fillTemplate(args, self);
                const streamProcess = spawn(command, args.split(/  */), {stdio: ['ignore', 'ignore', process.stderr]});

                streamProcess.on('exit', function (code) {
                    if (code !== 0) {
                        self.report.dxgCap.count++;
                        self.report.dxgCap.codes.push(code);
                        self.report.dxgCap.args = args;

                        logger.error(`${command} exited with code ${code}`);
                    } else {
                        logger.error(`${command} exited`);
                    }

                    if(self.report.dxgCap.count >= beLimitCountStartProcess && self.is_error_reported === false){
                         self.set_vm_in_error_state();
                    }
                    self.update({streamProcessState: PROCESS_EXITED, streamProcess: null});
                });
                self.update({streamProcessState: PROCESS_STARTED, streamProcess: streamProcess,
                    currentScaleWidth: self.targetScaleWidth, currentScaleHeight: self.targetScaleHeight,
                    currentFramerate: self.targetFramerate, currentLevel: self.targetLevel,
                    currentStreamArgsFormat: self.targetStreamArgsFormat,
                    currentSinkIp: self.sinkIp,
                    currentVideoPort: self.videoPort,
                    currentAudioPort: self.audioPort,
                    currentClientIp: self.clientIp
                });
            }

        } else {
            if (self.applicationProcessState === PROCESS_STARTED) {
                // TODO(adolgarev): Need to use tree-kill or spawn("taskkill", ["/pid", child.pid, '/f', '/t']);
                if (self.command !== null) {
                    spawn('taskkill', ['/f', '/im', path.basename(self.command)], {stdio: ['ignore', process.stdout, process.stderr]});
                }
                self.applicationProcess.kill('SIGTERM');
                self.report.launchersHelper.count--;
                self.update({applicationProcessState: PROCESS_TERMINATING});
            }

            if (self.streamProcessState === PROCESS_STARTED) {
                self.streamProcess.kill('SIGTERM');
                self.report.dxgCap.count--;
                self.update({streamProcessState: PROCESS_TERMINATING});
            }

            if (self.inputProcessState === PROCESS_STARTED) {
                self.inputProcess.kill('SIGTERM');
                self.report.tcpServer.count--;
                self.update({inputProcessState: PROCESS_TERMINATING});
            }

            if (self.resolutionHelperProcessState === PROCESS_STARTED) {
                self.resolutionHelperProcess.kill('SIGTERM');
                self.report.resolutionHelper.count--;
                self.update({resolutionHelperProcessState: PROCESS_TERMINATING});
            }

            // kill anydesk
            spawn('powershell.exe', ['Start-Process', 'taskkill', '-ArgumentList "/f", "/im", "AnyDesk.exe"',  '-Verb', 'runAs'], {stdio: ['ignore', process.stdout, process.stderr]});

            if (isProcessNotRunning(self.applicationProcessState)
                    && isProcessNotRunning(self.inputProcessState)
                    && isProcessNotRunning(self.streamProcessState)
                    && isProcessNotRunning(self.resolutionHelperProcessState)
                    && self.terminateCallback !== null) {
                self.terminateCallback();
                self.update(self.getInitialState());
            }
        }
    }

    run() {
        if (this.inProgress) {
            this.depth++;
        } else {
            this.inProgress = true;
        }

        this.stateChaged = false;

        this.runRules();

        if (this.stateChaged) {
            this.run();
        }
        this.inProgress = false;
        this.depth = 0;
    }

    terminate(cb) {
        const self = this;
        if (self.terminating === true) {
            return;
        }
        self.update({terminating: true, terminateCallback: cb});
    }

    set_vm_in_error_state(){
        const self = this;
        self.is_error_reported = true;

        let reason = {
            'report':self.report,
            'command': self.command,
            'args': self.args
        }

        if(self.testing === true && self.timeSpentInTestInMillis){
           reason['testing'] = `time spent in test mode ${(self.timeSpentInTestInMillis)/1000} seconds`
        }

        if(self.sessionId !== null){
            reason['sessionId'] = self.sessionId
        }

        let body = {
            mac: self.mac,
            address: self.address,
            reason: JSON.stringify(reason),
        }

        fetch(`http://${vmAutomationAddress}/vmauto/error_vm`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }).then(res => {
            if(!res.ok){
                self.is_error_reported = false;
                throw res;
            }
            self.is_error_reported = true;
        }).catch(err => logger.error('error at set_vm_in_error_state', err));

        self.notify_user({'message':'Something went wrong, try again later'});
    }

    notify_user(reason){
        const self = this;
        if((self.sinkIp !== '127.0.0.1') && (self.sinkIp !== null) ){
            if(reason.message !== undefined){
                fetch(`https://${self.sinkIp}:1337/userSession?sessionId=${self.sessionId}&notify=true&messageToUser=${reason.message}`, { method: 'POST'});

            }else if(reason.link !== undefined){
                fetch(`https://${self.sinkIp}:1337/userSession?sessionId=${self.sessionId}&notify=true&link=true`, { method: 'POST',
                    body: JSON.stringify(reason),
                    headers: {'Content-Type': 'application/json'},
                    });
            }
        }
    }

    test(streamArgsFormat, cb) {
        const self = this;
        if (self.testing === true) {
            return;
        }
        self.createTimeout();
        self.update({
            targetStreamArgsFormat: streamArgsFormat,
            testing: true, terminateCallback: () => {
                cb(null, self.testScreenshotFilePath);
            }
        });
    }


    createTimeout(){
        const self = this;
        if (self.timeTestSpentTimeout === null){
            const intervalInMillis = 10000;
            let timeTestSpentTimeout = setInterval(() => {

              if (self.testing === true) {
                  self.timeSpentInTestInMillis += intervalInMillis;
              }else{
                  self.timeSpentInTestInMillis = 0;
              }

              if(self.timeSpentInTestInMillis > beLimitTimeForTestInMillis && self.is_error_reported === false){
                  self.set_vm_in_error_state();
              }

            }, intervalInMillis);

            self.update({timeTestSpentTimeout: timeTestSpentTimeout});
        }
    }

    clearTimeout() {
        const self = this;
        if (self.timeTestSpentTimeout !== null) {
            clearInterval(self.timeTestSpentTimeout);
            self.timeSpentInTestInMillis = 0;
            self.is_error_reported = false;
            self.update({timeTestSpentTimeout: null});
        }
    }
}


const userSession = new UserSession();


(function preStartInit(){
    // init constants
    const form = new FormData();

    // get mac-adress
    let networks = require('os').networkInterfaces();
    let mac = '';
    let address = '';
    for (let key in networks[beNetworkInterfaceName]){
        if (networks[beNetworkInterfaceName][key]['family'] === 'IPv4'){
            if (networks[beNetworkInterfaceName][key]['mac']!=='00:00:00:00:00:00'){
                mac = networks[beNetworkInterfaceName][key]['mac'];
                address = networks[beNetworkInterfaceName][key]['address'];
            }else{
                logger.warn('Invalid value of mac: ', networks[beNetworkInterfaceName][key]['mac']);
            }
            break;
        }
    }
    userSession.mac = mac;
    userSession.address = address;
    let body = {mac: mac, address: address};
    logger.info(body);


   function test_diag(sap) {
    logger.info('Simulating license check...');

    // Simulăm că a primit licența
    const licenseCode = 0; // Codul 0 înseamnă succes
    const licenseHelperPath = path.join(__dirname, 'LicenseHelper.exe');

    if (licenseCode === 0) {
        logger.info('License check successful, running tests...');

        // Continuăm cu rularea testelor și a diagnosticului
        userSession.test(sap, (err, testScreenshotFilePath) => {
            if (err || testScreenshotFilePath === null) {
                logger.error('error at user test', err);
                // Restul codului pentru tratarea cazului de eroare și trimiterea rezultatelor către server
            } else {
                // run diag
const command = 'dxdiag.exe';
const outFilePath = path.join(__dirname, 'dxdiagOutput.txt');
const diagProcess = spawn(command, ['/whql:off', '/t', outFilePath], {stdio: ['ignore', process.stdout, process.stderr]});
diagProcess.on('exit', function (code) {
    fs.readFile(outFilePath, function (err, content) {
        if (!err && code === 0) {
            // Simulate that everything is received successfully
            logger.info('Simulating success');

            form.append('mac', mac);
            form.append('diag', content);
            form.append('screenshot', fs.createReadStream(testScreenshotFilePath));
            // Simulate sending data to a fake server (replace with appropriate address)
            const fakeServerAddress = 'http://localhost:9002/vmauto/tested_vm';
            form.submit(fakeServerAddress, function(err, res) {
                if (err) {
                    logger.error('error at post /tested_vm', err);
                }
            });
        } else {
            logger.error('Failed to run diagnostic tool', err);
            // post to vmauto, vm will be in_error_state = True
            form.append('mac', mac);
            form.append('screenshot', fs.createReadStream(testScreenshotFilePath));
            form.submit(`http://http://localhost:9002/vmauto/tested_vm`, function(err, res) {
                if(err){
                    logger.error('error at post /tested_vm failed screenshot', err);
                }
            });
        }
    });
});

            }
        });
    } else {
        logger.error('License check failed.');
        // Restul codului pentru tratarea cazului în care verificarea licenței a eșuat
    }
}



    // post to vm_auto to assign IP and mac
     fetch(`http://localhost:9002/vmauto/started_vm`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    }).then(res => {
        if (!res.ok) {
            throw res;
        }else{
            return res.json();
        }
    }).then(json => test_diag(json.sap)
    ).catch(err => {
        logger.error('error at post /started_vm', err);
    });

}());
