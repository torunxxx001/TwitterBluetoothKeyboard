"use strict";

let url = require('url');
let net = require('net');
let http = require('http');
let nconf = require('nconf');
let WebSocketServer = require('websocket').server;
let Twitter = require('twitter');

let nconf_auth = new nconf.Provider();
let streaming_param = new nconf.Provider();

nconf_auth.use('file', {'file': './config/default.json'});
streaming_param.use('file', {'file': './var/streaming_param.json'});

nconf_auth.load();

if( !nconf_auth.get('TWITTER_CLIENT_TOKEN') || !nconf_auth.get('TWITTER_CLIENT_SECRET')){
	console.log('Auth設定なしのため終了します');
	process.exit();
}



let connect_status = {
	'streaming': false,
	'bluetooth': false,
	'websocket': false
};

let sended_streaming_params = {};


// ***** CLOSE処理 *****
let bt_end_server_flag = false;
let st_end_server_flag = false;

let close_proc = function(){
	bt_end_server_flag = true;
	st_end_server_flag = true;
	
	client.destroy();
	if(tw_stream != null) {
		tw_stream.destroy();
	}
	tw_stream = null;

	ws_connections.forEach(function(dat, idx){
		if(dat.connected == true){
			dat.close();
		}
	});
	wss.close();
	
	setTimeout(function(){ process.exit(); }, 10000);
};

// ***** WebSocket生成 *****
var wss = http.createServer(function(request, response) {
	response.writeHead(404);
	response.end();
}).listen(nconf_auth.get('STREAM_STATUS_PORT'), function(){
	connect_status['websocket'] = true;
});

var wsServer = new WebSocketServer({
	httpServer: wss,
	autoAcceptConnections: false
});

let ws_connections = [];

let ws_sends = function(in_data){
	ws_connections.forEach(function(dat, idx){
		if(dat.connected == true){
			dat.sendUTF(in_data);
		}
	});
};

wsServer.on('request', function(request) {
	var contmp = request.accept();

	let chk_tmp = ws_connections;
	chk_tmp.forEach(function(dat, idx){
		if(dat.connected == false){
			ws_connections.splice(idx, 1);
		}
	});
	ws_connections.push(contmp);


	contmp.on('message', function(message) {
		if(ws_connections.length == 0) return;
		
		if(message.utf8Data.indexOf('SEND_CUSTOM_KEYS:') == 0){
			let in_params = message.utf8Data.substring(17);
			in_params = JSON.parse(in_params);
			
			let successful = 'NG';
			if(in_params['send_keys'] && in_params['send_keys'].match(/^[0-9a-fA-F]+$/)){
				console.log('SendKey: ' + in_params['send_keys']);
				let send_bytes = Buffer.from(in_params['send_keys'], 'hex');

				if(connect_status['bluetooth'] == true){
					client.write(('000000' + send_bytes.length).slice(-6));
					client.write(send_bytes);
					
					successful = 'OK';
				}
			}
			
			ws_sends(
				JSON.stringify({
					'data_type': 'info',
					'action': 'send_custom_keys',
					'status': successful
				})
			);
		}
		
		if(message.utf8Data.indexOf('SAVE_STREAMING_PARAMS:') == 0){
			let in_params = message.utf8Data.substring(22);
			in_params = JSON.parse(in_params);

			if(in_params['follow']){
				streaming_param.set('follow', in_params['follow']);
			}else{
				streaming_param.set('follow', '');
			}
			if(in_params['track']){
				streaming_param.set('track', in_params['track']);
			}else{
				streaming_param.set('track', '');
			}
			streaming_param.save();

			ws_sends(
					JSON.stringify({
						'data_type': 'info',
						'action': 'save_streaming_params',
						'status': 'OK'
					})
			);
		}
		switch(message.utf8Data){
		case '<!exit!>':
			ws_sends(
					JSON.stringify({
						'data_type': 'info',
						'action': 'exit',
						'status': 'OK'
					})
			);
			
			close_proc();
			break;
		case '<!connect_stream!>':
			Promise.resolve()
				.then(function(){
					return new Promise(function(resolve, reject){
						load_streaming_setting(resolve);
					});
				})
				.then(function(){
					return new Promise(function(resolve, reject){
						let status = 'OK';
						if(connect_status['streaming'] == false){
							st_end_server_flag = false;
							
							console.log('Connect TW Act');
							try_tw_connect();
						}else{
							status = 'already connected';
						}
						
						ws_sends(
								JSON.stringify({
									'data_type': 'info',
									'action': 'connect_stream',
									'status': status
								})
						);
					});
				});
			break;
		case '<!disconnect_stream!>':
			st_end_server_flag = true;
			if(tw_stream) {
				tw_stream.destroy();
			}
			tw_stream = null;

			ws_sends(
					JSON.stringify({
						'data_type': 'info',
						'action': 'disconnect_stream',
						'status': 'OK'
					})
			);
			break;
		case '<!streaming_params!>':
			ws_sends(
					JSON.stringify({
						'data_type': 'info',
						'action': 'streaming_params',
						'params': sended_streaming_params
					})
			);
			break;
		case '<!status!>':
			ws_sends(
					JSON.stringify({
						'data_type': 'info',
						'action': 'status',
						'status': connect_status
					})
			);
			break;
		}
	});
	contmp.on('close', function(reasonCode, description) {
		let chk_tmp = ws_connections;
		chk_tmp.forEach(function(dat, idx){
			if(dat.connected == false){
				ws_connections.splice(idx, 1);
			}
		});
	});
});


// ***** Bluetooth送信用ソケット生成 *****
//初期再起動
var client = new net.Socket();
client.connect(nconf_auth.get('BLUETOOTH_SERVER_PORT'), '127.0.0.1', function(){
	client.write('000010<!reboot!>');
});
client.once('data', function(data){
	if(data == 'OK'){
		client.destroy();
	}
});
client.once('close', function() {
	let retry_BL = 0;

	let doConBl = function(){
		client.removeAllListeners('connect');
		client.connect(nconf_auth.get('BLUETOOTH_SERVER_PORT'), '127.0.0.1', function(){
			connect_status['bluetooth'] = true;
		});

		client.removeAllListeners('data');
		client.on('data', function(data) {
			let bt_send_data = data.toString();
			
			if(bt_send_data.substring(0, 5) == 'SEND-'){
				let sended_heyanum = bt_send_data.substring(5);
				sended_heyanum = sended_heyanum.replace(/[^\d]/g,'');
				
				if(ws_connections.length != 0 && sended_heyanum.length > 0){
					ws_sends(
						JSON.stringify({
							'data_type': 'log',
							'log_type': 'bluetooth',
							'message': 'BT SendRoomNum: ' + sended_heyanum
						})
					);
				}
			}
		});

		client.removeAllListeners('close');
		client.on('close', function() {
			connect_status['bluetooth'] = false;

			retry_BL++;
			console.log('retry BL: ' + retry_BL);
			
			if(bt_end_server_flag == false){
				setTimeout(doConBl, 2000);
			}
		});

		client.removeAllListeners('error');
		client.on('error', function(err){
		});
	};

	doConBl();
});



// ***** StreamingAPIソケット生成 *****

let tw_cli = new Twitter({
	consumer_key:        nconf_auth.get('TWITTER_CONSUMER_KEY'),
	consumer_secret:     nconf_auth.get('TWITTER_CONSUMER_SECRET'),
	access_token_key:    nconf_auth.get('TWITTER_CLIENT_TOKEN'),
	access_token_secret: nconf_auth.get('TWITTER_CLIENT_SECRET')
});

var tw_stream = null;
var tw_accs_params = {};


let load_streaming_setting = function(end_callback){
	tw_accs_params = {};

	streaming_param.load();
	
	if(streaming_param.get('track')){
		tw_accs_params['track'] = streaming_param.get('track');
	}
	if(streaming_param.get('follow')){
		let params = {screen_name: streaming_param.get('follow')};
		tw_cli.get('users/lookup', params, function(error, user_info, response) {
			if(!error){
				let tw_idlist = [];
				let tw_nmlist = [];
				
				user_info.forEach(function(user_item){
					tw_idlist.push(user_item.id_str);
					tw_nmlist.push(user_item.screen_name);
				});
				
				tw_accs_params['follow'] = tw_idlist.join(',');
				
				sended_streaming_params['follow_name'] = tw_nmlist.join(',');
				
				
				if(end_callback) end_callback();
			}
		});
	}else{
		if(end_callback) end_callback();
	}
};

let twWaitTimeAdd = 60;
let try_tw_connect = function(){
	console.log(tw_accs_params);

	let bak_tw_accs_params = tw_accs_params;
	console.log('try tw connect...');
	
	tw_stream = null;
	tw_cli.stream('statuses/filter', tw_accs_params, function(stream){
		connect_status['streaming'] = true;
		sended_streaming_params['follow_id'] = bak_tw_accs_params['follow'];
		sended_streaming_params['track']     = bak_tw_accs_params['track'];

		console.log('OPEN STREAMING');
		if(ws_connections.length != 0){
			ws_sends(
					JSON.stringify({
						'data_type': 'log',
						'log_type': 'streaming',
						'message': 'Twitter Stream OPEN!'
					})
			);
		}

		tw_stream = stream;
		
		stream.removeAllListeners('data');
		stream.on('data', function(tweet) {
			if(bak_tw_accs_params['follow']){
				let found = false;
				bak_tw_accs_params['follow'].split(',').forEach(function(data){
					if(data == tweet.user.id_str){
						found = true;
					}
				});
				
				if(found == false) return;
			}

			if(ws_connections.length != 0){
				ws_sends(
					JSON.stringify({
						'data_type': 'tweet',
						'user_name' : tweet.user.name,
						'screen_name' : tweet.user.screen_name,
						'image': tweet.user.profile_image_url,
						'tweet_id': tweet.id_str,
						'tweet': tweet.text
					})
				);
			}
			
			if(connect_status['bluetooth'] == true){
				let tweet_text = tweet.text;
				
				//リプライを削除
				tweet_text = tweet_text.replace(/[@＠][^ 　]+?[ 　]/g, '');

				let heya_num = tweet_text.match(/((\d|[０-９]){5})/);
				
				if(heya_num){
					heya_num = heya_num[1];

					let conv_num_table = [
						['０', '0'],
						['１', '1'],
						['２', '2'],
						['３', '3'],
						['４', '4'],
						['５', '5'],
						['６', '6'],
						['７', '7'],
						['８', '8'],
						['９', '9']
					];
					conv_num_table.forEach(function(mnum){
						heya_num = heya_num.replace(new RegExp(mnum[0],'g'), mnum[1]);
					});
					
					if(heya_num.match(/\d{5}/)){
						console.log('SEND HEYA:' + heya_num);
						
						let sendbuf = 
							(new Buffer([0x08,0x08,0x08,0x08,0x08,0x08,0x08])) + 
							(new Buffer(heya_num));
						
						if(connect_status['bluetooth'] == true){
							client.write(('000000' + sendbuf.length).slice(-6));
							client.write(sendbuf);
						}
					}
				}
			}
		});

		let last_recieve_ping_time = Date.now();

		stream.removeAllListeners('ping');
		stream.on('ping', function() {
			console.log('Recieve PING');
			last_recieve_ping_time = Date.now();
			
			twWaitTimeAdd = 60;
		});
		
		let check_connection = function(){
			//最終受信が４５秒前なら再接続
			
			if(connect_status['streaming'] == true){
				console.log('TM: ' + (Date.now() - last_recieve_ping_time));
				if((Date.now() - last_recieve_ping_time) > 45*1000){
					console.log('Connection Disconnected... Recon!');
					if(ws_connections.length != 0){
						ws_sends(
								JSON.stringify({
									'data_type': 'log',
									'log_type': 'streaming',
									'message': 'Twitter Stream Disconnected... Recon!'
								})
						);
					}
			
					connect_status['streaming'] = false;
					if(tw_stream) {
						tw_stream.destroy();
					}
					tw_stream = null;
					
					if(st_end_server_flag == false){
						console.log('TW Discon 5sec after Recon!');
						setTimeout(try_tw_connect, 5000); //切断検知の再接続は5秒後
					}
				}else{
					setTimeout(check_connection, 1000);
				}
			}
		};
		check_connection();

		stream.removeAllListeners('end');
		stream.on('end', function() {
			
			if(connect_status['streaming'] == true){
				connect_status['streaming'] = false;
			
				if(tw_stream){
					tw_stream.Destroy();
				}
				tw_stream = null;
			
				console.log('CLOSE STREAMING');
				if(ws_connections.length != 0){
					ws_sends(
							JSON.stringify({
								'data_type': 'log',
								'log_type': 'streaming',
								'message': 'Twitter Stream CLOSE!'
							})
					);
				}

				if(st_end_server_flag == false){
					console.log('TW ConEnd 5sec after Recon!');
					setTimeout(try_tw_connect, 5000);  //回線終了後の再接続は5秒後
				}
			}
		});


		stream.removeAllListeners('error');
		stream.on('error', function(error) {
			console.log(error);
			
			if(connect_status['streaming'] == true){
				connect_status['streaming'] = false;
				
				if(tw_stream) {
					tw_stream.destroy();
				}
				tw_stream = null;
			
				console.log('CLOSE STREAMING');
				if(ws_connections.length != 0){
					ws_sends(
							JSON.stringify({
								'data_type': 'log',
								'log_type': 'streaming',
								'message': 'Twitter Stream ERROR Recon!'
							})
					);
				}

				if(st_end_server_flag == false){
					console.log('TW Error ' + twWaitTimeAdd + ' sec after Recon!');
					setTimeout(try_tw_connect, (twWaitTimeAdd + 10) * 1000); //エラー時の再接続は１分x倍待機
					
					twWaitTimeAdd = twWaitTimeAdd * 2;
				}
			}
		});
	});
};
