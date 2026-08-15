# dsh-bilibili

[English](README.md) | 涓枃

涓?DeepSeek Harness 鎵撻€犵殑 B 绔欐绱㈡彃浠躲€傚畨瑁呭悗 Agent 鑾峰緱涓変釜宸ュ叿锛?
- bilibili_search 鈥斺€?鎸夊叧閿瘝鎵捐棰戯細鏍囬銆乁P 涓汇€佹挱鏀鹃噺銆佹椂闀裤€佸彂甯冩棩鏈熴€?- bilibili_video 鈥斺€?鍗曚釜瑙嗛鐨勫畬鏁村厓鏁版嵁锛氬悇椤硅鏁般€佸垎鍖恒€佸垎 P 鍒楄〃銆佺畝浠嬨€?- bilibili_subtitles 鈥斺€?鍗曚釜瑙嗛鐨勫瓧骞曟枃绋匡紝鍚堝苟涓虹函鏂囨湰銆?
榛樿鍖垮悕鍙敤锛氭悳绱㈣嚜甯﹀尶鍚?cookie 寮曞锛屽厓鏁版嵁濮嬬粓鍙敤銆傞厤缃?SESSDATA 鍚庤В閿佺櫥褰曞彲瑙佸瓧骞曡建鈥斺€斿鏁?AI 瀛楀箷閮藉湪杩欎竴灞傘€傛彃浠跺彧璇诲厓鏁版嵁涓庡瓧骞曟枃鏈紝缁濅笉涓嬭浇瑙嗛鎴栭煶棰戞祦銆?
## 瀹夎

鎵ц锛?
    dsh plugin --profile web add git+https://github.com/moxingovo/dsh-bilibili

閲嶅惎 dsh web锛屾柊浼氳瘽鑷姩鑾峰緱 bilibili_search銆乥ilibili_video 涓?bilibili_subtitles銆?
## 鍙€?SESSDATA

鐧诲綍 bilibili.com锛屾墦寮€ DevTools锛岃繘鍏?搴旂敤锛屽啀杩?Cookie锛岀偣寮€ bilibili.com 鏉＄洰锛屽鍒?SESSDATA 鐨勫€尖€斺€旇８ token锛屼笉鏄暣鏉?Cookie 澶淬€傚啓鍏ョ幆澧冨彉閲忔垨 DSH_HOME 涓嬬殑 .env 鏂囦欢锛?
    BILIBILI_SESSDATA=<浣犵殑瑁?token>

涓嶉厤缃椂鍙繑鍥炲叕寮€鍙鐨勫瓧骞曡建锛涢渶瑕佺櫥褰曠殑瀛楀箷浠ョ粨鏋勫寲閿欒鐮?BILIBILI_LOGIN_REQUIRED 澶辫触銆?
## 閰嶇疆

| 閿?| 榛樿 | 鍚箟 |
|---|---|---|
| cookieEnv | BILIBILI_SESSDATA | 瀛樻斁鍙€?SESSDATA token 鐨勭幆澧冨彉閲忓悕銆?|
| requestTimeoutMs | 30000 | 鍗曡姹傝秴鏃讹紝姣銆?|
| subtitleLanguage | zh-CN | 棣栭€夊瓧骞曡瑷€鏍囩锛涚簿纭尮閰嶄紭鍏堬紝鍚﹀垯鍙栫涓€鏉¤建銆?|
| searchMaxPageSize | 20 | bilibili_search 椤靛ぇ灏忎笂闄愩€?|
| subtitleMaxChars | 80000 | bilibili_subtitles 鏂囩瀛楃涓婇檺锛屽€煎眰鎴柇骞跺甫 truncated 鏍囪銆?|

鍙湪 profiles/web/cordis.patch.yml 涓鐩栦换鎰忓瓧娈碘€斺€旀寜琛屽悗灞傝鐩栧墠灞傘€?
## 閿欒鐮?
宸ュ叿浠ョ粨鏋勫寲閿欒澶辫触骞舵惡甯︿笅鍒椾唬鐮侊細BILIBILI_RISK_CONTROL 瀵瑰簲 -412锛岀◢鍚庨噸璇曞嵆鍙紝鎻掍欢宸茶嚜鍔ㄥ紩瀵煎尶鍚?cookie锛汢ILIBILI_FORBIDDEN 瀵瑰簲 -403锛汢ILIBILI_NOT_FOUND 瀵瑰簲 -404锛汢ILIBILI_LOGIN_REQUIRED 瀵瑰簲 -101锛岄€氬父鏄瓧骞曪紱BILIBILI_SUBTITLES_UNAVAILABLE 琛ㄧず鏃犲彲璁块棶瀛楀箷杞ㄦ垨瀛楀箷浣撲负绌猴紱BILIBILI_REDIRECT_REFUSED 鏄嚟鎹畨鍏ㄤ繚鎶わ紱BILIBILI_BAD_RESPONSE 琛ㄧず闈?JSON 鎴栦俊灏佺己 code 瀛楁锛汢ILIBILI_REQUEST_FAILED 琛ㄧず缃戠粶澶辫触锛汢ILIBILI_WBI_KEYS_UNAVAILABLE 琛ㄧず绛惧悕瀵嗛挜缂哄け銆?
## 瀹夊叏

- cookie 鍙粠鐜鍙橀噺璇诲彇锛岀粷涓嶈繘鍏ラ厤缃枃浠躲€佹棩蹇楁垨宸ュ叿杈撳嚭銆?- 姣忔璇锋眰鎷掔粷閲嶅畾鍚戯紝cookie 涓嶅彲鑳借杞彂鍒板叾浠栨簮銆?- cookie 鍙彂閫佺粰 api.bilibili.com锛涘瓧骞?CDN 涓嬭浇涓嶆惡甯?cookie銆?- 涓嶄笅杞借棰戜笌闊抽銆?
## Skills

闅忎粨搴撻檮甯︿袱浠芥妧鑳斤細skills/ 涓嬬殑 plugin-tool-bilibili 璐熻矗宸ュ叿鐢ㄦ硶锛宲lugin-web-bilibili 璐熻矗鏈嶅姟閰嶇疆涓庨敊璇爜銆傛妸瀹冧滑澶嶅埗杩涗綘鐨?harness 鎶€鑳界洰褰曪紝Agent 渚夸細鍦ㄨ皟鐢ㄥ伐鍏峰墠鍏堟煡闃呫€?
## 寮€鍙?
闇€瑕?Node 22 鎴栨洿鏂帮細

```sh
npm ci
npm test
```

浠撳簱鐢?package-lock.json 閽夋渚濊禆鏍戙€傛祴璇曞浠跺畬鍏ㄧ绾胯繍琛岋紙HTTP 鍏ㄩ儴 mock锛夛紱绫诲瀷妫€鏌ラ拡瀵瑰凡鍙戝竷鐨?DeepSeek Harness 鍖呮墽琛屻€?
## 宸茬煡闂

DeepSeek Harness 瀹樻柟鍖呯殑鏃╂湡 rc 鐗堟湰澹版槑浜嗘湭鍙戝竷鐨?peer 渚濊禆锛歞sh-agent 0.0.1-rc.1/rc.2 涓?dsh-session 0.0.1-rc.1/rc.2 寮曠敤浜?@deepseek-ai/dsh-type-meta锛岃鍖呬笉鍦?npm 娉ㄥ唽琛ㄤ笂銆傚叏鏂板畨瑁呮椂鑻ヨВ鏋愬櫒钀藉埌杩欎簺鐗堟湰锛屼細浠?@deepseek-ai/dsh-type-meta 鐨?404 澶辫触锛堝凡鍦?pnpm 11 涓?npmmirror 闀滃儚澶嶇幇锛沶pm 瑙ｆ瀽鍒?0.0.1-rc.5 鎵€浠ユ垚鍔燂級銆傚绛栵細鐢?npm 閰嶅悎浠撳簱鍐呯殑 package-lock.json锛坣pm ci锛夛紝鎴栧湪宸茶濂?harness 鐨勫伐浣滃尯鍐呮墽琛?dsh plugin add鈥斺€斿叾 lockfile 宸查攣瀹氬彲鐢ㄧ増鏈€傝繖鏄笂娓?rc 闃舵鐨勫彂甯冮棶棰橈紝涓婃父淇鍏冩暟鎹悗鑷姩娑堝け銆?
## 璁稿彲璇?
MIT锛岃 LICENSE銆?