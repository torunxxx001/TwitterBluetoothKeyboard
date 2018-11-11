# 概要 
趣味で作成した、Twitterで投稿された特定の文字を抽出し、Bluetooth経由でiPadに文字を転送するための機械です。  
RaspberryPiとBluetoothモジュールを接続して、作成しました。  
  
tw_server/ が、Web上でコントロールするためのHTTPサーバと、TwitterAPIから文字列を取得して解析しbt_serverへ送信するプログラム(NodeJS)で、  
bt_server/ が、Bluetoothモジュールへと文字送信信号を送るサーバプログラム(C++言語)です。

# 外観
- Webでのコントロール用UIの外観
![WebUI](https://raw.githubusercontent.com/torunxxx001/TwitterBluetoothKeyboard/master/web.jpg)
  
- RaspberryPiとBluetoothモジュールの外観
![RPIBLU](https://raw.githubusercontent.com/torunxxx001/TwitterBluetoothKeyboard/master/P_20181111_154717_vHDR_On.jpg)
  
以上
