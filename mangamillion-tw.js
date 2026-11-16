// MANGA MILLION, Traditional Chinese only. Experimental v0.1.0.
// Device credentials and chapter image parameters are obtained at runtime only.
const mangayomiSources = [{name:'MANGA MILLION（繁體中文・測試版）',lang:'zh-Hant',baseUrl:'https://mangamillion.shueisha.co.jp',apiUrl:'https://api.mangamillion.shueisha.co.jp',iconUrl:'https://mangamillion.shueisha.co.jp/favicon.ico',typeSource:'single',itemType:0,isNsfw:false,version:'0.1.0',dateFormat:'',dateFormatLocale:'',pkgPath:'mangamillion-tw.js'}];

function mmBytes(body) {
  const b = new Uint8Array(body.length);
  for (let i=0;i<body.length;i++) {
    const n=body.charCodeAt(i);
    if (n>255) throw new Error('App 的 HTTP 介面未保留二進位資料，無法解析此來源。');
    b[i]=n;
  }
  return b;
}
function mmUtf8(bytes) {
  let escaped='';
  for (const n of bytes) escaped+='%'+n.toString(16).padStart(2,'0');
  return decodeURIComponent(escaped);
}
function mmProto(bytes) {
  let p=0;
  const out={};
  function read() {
    let value=0, power=1;
    for (let i=0;i<10;i++) {
      if(p>=bytes.length) throw new Error('不完整的網站回應');
      const n=bytes[p++];value+=(n&127)*power;
      if(n<128) return value;
      power*=128;
    }
    throw new Error('網站資料格式不正確');
  }
  while(p<bytes.length) {
    const key=read(), field=Math.floor(key/8), wire=key%8;
    if(!field) throw new Error('無效的網站欄位');
    let v;
    if(wire===0) v=read();
    else if(wire===2) {const size=read();if(p+size>bytes.length)throw new Error('不完整的網站欄位');v=bytes.slice(p,p+size);p+=size;}
    else if(wire===1||wire===5) {const size=wire===1?8:4;if(p+size>bytes.length)throw new Error('不完整的網站欄位');v=bytes.slice(p,p+size);p+=size;}
    else throw new Error('不支援的網站欄位格式');
    if(!out[field])out[field]=[];
    out[field].push(v);
  }
  return out;
}
const mmValue=(m,n,fallback)=>m[n]&&m[n].length?m[n][0]:fallback;
const mmNumber=(m,n)=>mmValue(m,n,0);
const mmText=(m,n)=>mmUtf8(mmValue(m,n,new Uint8Array(0)));
const mmMessage=(m,n)=>mmProto(mmValue(m,n,new Uint8Array(0)));
const mmMessages=(m,n)=>(m[n]||[]).map(mmProto);
function mmBase64(bytes) {
  const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks=[];
  for(let offset=0;offset<bytes.length;offset+=12288) {
    let part='';const end=Math.min(offset+12288,bytes.length);
    for(let i=offset;i<end;i+=3) {
      const v=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
      part+=a[(v>>>18)&63]+a[(v>>>12)&63]+(i+1<bytes.length?a[(v>>>6)&63]:'=')+(i+2<bytes.length?a[v&63]:'=');
    }
    chunks.push(part);
  }
  return chunks.join('');
}
function mmHex(s) {
  if(!/^(?:[a-fA-F0-9]{2})+$/.test(s))throw new Error('圖片參數格式錯誤');
  return new Uint8Array(s.match(/../g).map(x=>parseInt(x,16)));
}
// Small AES-CBC decoder. No external scripts, embedded keys, or eval.
const mmAesTables=(()=>{
  function mul(a,b){let r=0;while(b){if(b&1)r^=a;a=((a<<1)^((a&128)?283:0))&255;b>>>=1;}return r;}
  const s=new Uint8Array(256), inv=new Uint8Array(256), tables={};
  for(let i=0;i<256;i++) {
    let inverse=0;
    if(i)for(let j=1;j<256;j++)if(mul(i,j)===1){inverse=j;break;}
    let x=inverse;
    for(let shift=1;shift<=4;shift++)x^=((inverse<<shift)|(inverse>>>(8-shift)))&255;
    s[i]=x^99;inv[s[i]]=i;
  }
  for(const n of [9,11,13,14]){tables[n]=new Uint8Array(256);for(let i=0;i<256;i++)tables[n][i]=mul(i,n);}
  return {s,inv,tables,mul};
})();
function mmAesCbc(cipher,keyHex,ivHex) {
  const key=mmHex(keyHex),iv=mmHex(ivHex), nk=key.length/4,nr=nk+6;
  if(![4,6,8].includes(nk)||iv.length!==16||!cipher.length||cipher.length%16)throw new Error('圖片加密資料不完整');
  const expanded=new Uint8Array(16*(nr+1));expanded.set(key);
  let used=key.length,rcon=1,temp=new Uint8Array(4);
  while(used<expanded.length){temp.set(expanded.slice(used-4,used));if(used%key.length===0){const first=temp[0];temp[0]=mmAesTables.s[temp[1]]^rcon;temp[1]=mmAesTables.s[temp[2]];temp[2]=mmAesTables.s[temp[3]];temp[3]=mmAesTables.s[first];rcon=mmAesTables.mul(rcon,2);}else if(nk===8&&used%key.length===16){for(let i=0;i<4;i++)temp[i]=mmAesTables.s[temp[i]];}for(let i=0;i<4;i++){expanded[used]=expanded[used-key.length]^temp[i];used++;}}
  const output=new Uint8Array(cipher.length),state=new Uint8Array(16),previous=new Uint8Array(iv),shifted=new Uint8Array(16),t=mmAesTables.tables;
  function add(round){for(let i=0;i<16;i++)state[i]^=expanded[16*round+i];}
  function shiftSub(){shifted.set(state);for(let col=0;col<4;col++)for(let row=0;row<4;row++)state[4*col+row]=mmAesTables.inv[shifted[4*((col-row+4)%4)+row]];}
  for(let offset=0;offset<cipher.length;offset+=16){state.set(cipher.slice(offset,offset+16));add(nr);for(let round=nr-1;round>0;round--){shiftSub();add(round);for(let col=0;col<4;col++){const i=4*col,a=state[i],b=state[i+1],c=state[i+2],d=state[i+3];state[i]=t[14][a]^t[11][b]^t[13][c]^t[9][d];state[i+1]=t[9][a]^t[14][b]^t[11][c]^t[13][d];state[i+2]=t[13][a]^t[9][b]^t[14][c]^t[11][d];state[i+3]=t[11][a]^t[13][b]^t[9][c]^t[14][d];}}shiftSub();add(0);for(let i=0;i<16;i++)output[offset+i]=state[i]^previous[i];previous.set(cipher.slice(offset,offset+16));}
  const padding=output[output.length-1];
  if(padding<1||padding>16)throw new Error('圖片還原失敗');
  for(let i=output.length-padding;i<output.length;i++)if(output[i]!==padding)throw new Error('圖片還原校驗失敗');
  return output.slice(0,output.length-padding);
}
function mmImageMime(b) {
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'image/png';
  if(b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';
  throw new Error('網站沒有傳回可辨識的漫畫圖片');
}

class DefaultExtension extends MProvider {
  base='https://mangamillion.shueisha.co.jp';
  apiBase='https://api.mangamillion.shueisha.co.jp';
  language='zh-TW';
  token=null;
  registration=null;
  headers={'User-Agent':'Mozilla/5.0','Referer':'https://mangamillion.shueisha.co.jp/','Origin':'https://mangamillion.shueisha.co.jp'};
  get supportsLatest(){return true;}
  getHeaders(url){return {...this.headers};}
  async wire(path,params,token,post) {
    const query={service_language:'zh-CN',...params};
    if(!post)query.avif_enable='false';
    const url=this.apiBase+path+'?'+Object.keys(query).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(query[k])).join('&');
    const headers={...this.headers};if(token)headers['Access-Token']=token;
    const client=new Client();
    const response=post?await client.post(url,headers):await client.get(url,headers);
    if(response.statusCode<200||response.statusCode>=300)throw new Error('MANGA MILLION API HTTP '+response.statusCode+'；請先在來源內建瀏覽器確認網站是否可讀。');
    let m;
    try {m=mmProto(mmBytes(response.body));} catch(e){throw new Error('無法解析網站二進位回應：'+e.message);}
    if(mmNumber(m,1)!==0)throw new Error('MANGA MILLION 回應失敗（狀態 '+mmNumber(m,1)+'）。');
    return m;
  }
  async device() {
    if(this.token)return this.token;
    if(!this.registration)this.registration=(async()=>{const m=await this.wire('/api/register',{},null,true);const token=mmText(mmMessage(m,170),1);if(!token)throw new Error('網站未核發匿名裝置憑證');this.token=token;return token;})().finally(()=>{this.registration=null;});
    return this.registration;
  }
  async api(path,params,resultField){const m=await this.wire(path,params,await this.device(),false);if(!m[resultField])throw new Error('網站回應缺少所需資料');return mmMessage(m,resultField);}
  async titles(query,page,latest) {
    if(page>1)return {list:[],hasNextPage:false};
    const args={translated_language:this.language};if(query)args.text=query;
    const data=await this.api('/api/search',args,20);
    let titles=mmMessages(data,1).filter(x=>(x[2]||[]).some(v=>mmUtf8(v)===this.language)).map(x=>mmMessage(x,1));
    if(latest)titles.sort((a,b)=>mmNumber(b,9)-mmNumber(a,9));
    return {list:titles.map(x=>({name:mmText(x,3),imageUrl:mmText(x,2),link:this.base+'/zh-CN/title/'+mmNumber(x,1)+'?lang='+this.language})),hasNextPage:false};
  }
  async getPopular(page){return this.titles('',page,false);}
  async getLatestUpdates(page){return this.titles('',page,true);}
  async search(query,page,filters){return this.titles(query.trim(),page,false);}
  titleId(url){const m=url.match(/\/title\/(\d+)/);if(!m)throw new Error('作品網址格式不正確');return m[1];}
  async getDetail(url) {
    const id=this.titleId(url);
    const data=await this.api('/api/title_detail',{original_title_id:id},50);
    const available=mmMessages(data,9).map(x=>mmText(x,3));
    if(!available.includes(this.language))throw new Error('這部作品目前沒有繁體中文版');
    const title=mmMessage(data,1);
    const chapters=await this.api('/api/chapter_list',{original_title_id:id,translated_language:this.language},60);
    const seen={},episodes=[];
    for(const group of mmMessages(chapters,2)){
      if(![0,2].includes(mmNumber(group,1)))continue;
      for(const ch of mmMessages(group,2)){
        const cid=mmNumber(ch,3);if(!cid||seen[cid])continue;seen[cid]=true;
        const num=mmText(ch,1),name=mmText(ch,2);
        episodes.push({name:'#'+num+(name?' '+name:''),url:this.base+'/zh-CN/title/'+id+'/chapter/'+cid});
      }
    }
    episodes.sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}));
    return {name:mmText(title,2),author:mmText(title,3),description:mmText(title,7),imageUrl:mmText(title,1),genre:mmMessages(title,4).map(x=>mmText(x,2)),status:5,episodes};
  }
  async getPageList(url) {
    const match=url.match(/\/title\/(\d+)\/chapter\/(\d+)/);if(!match)throw new Error('章節網址格式不正確');
    const viewer=await this.api('/api/viewer',{translated_chapter_id:match[2],quality:'low'},70);
    const chapter=mmMessage(viewer,2);
    if(mmText(mmMessage(chapter,3),3)!==this.language)throw new Error('此章節不是繁體中文，已停止讀取');
    if(mmNumber(chapter,2)!==Number(match[1]))throw new Error('章節與作品不一致');
    const pages=mmMessages(viewer,1),key=mmText(viewer,7),iv=mmText(viewer,8);
    if(!pages.length)throw new Error('這個繁體章節目前沒有可讀取的圖片');
    const results=new Array(pages.length);let next=0;
    const worker=async()=>{
      while(next<pages.length){
        const index=next++,imageUrl=mmText(pages[index],1);
        if(!/^https:\/\//.test(imageUrl))throw new Error('圖片網址格式不正確');
        const response=await new Client().get(imageUrl,this.headers);
        if(response.statusCode!==200)throw new Error('第 '+(index+1)+' 頁下載失敗（HTTP '+response.statusCode+'）');
        let bytes=mmBytes(response.body);
        if(key&&iv)bytes=mmAesCbc(bytes,key,iv);
        const mime=mmImageMime(bytes);
        results[index]='data:'+mime+';base64,'+mmBase64(bytes);
      }
    };
    // Decode before handing pages to the native reader; keep concurrency bounded.
    await Promise.all([worker(),worker()]);
    return results;
  }
  getFilterList(){return [];}
  getSourcePreferences(){return [];}
}
