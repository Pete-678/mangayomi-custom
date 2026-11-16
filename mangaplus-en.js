// MANGA Plus English source. Protocol implemented independently.
// Reference: current MANGA Plus website and keiyoushi MANGA Plus Dto.kt/API paths.
// Anonymous session identifiers and page parameters are generated/fetched at runtime.
const mangayomiSources=[{name:'MANGA Plus（英文版）',lang:'en',baseUrl:'https://mangaplus.shueisha.co.jp',apiUrl:'https://jumpg-webapi.tokyo-cdn.com/api',iconUrl:'https://mangaplus.shueisha.co.jp/favicon.ico',typeSource:'single',itemType:0,isNsfw:false,version:'0.1.0',dateFormat:'',dateFormatLocale:'',pkgPath:'mangaplus-en.js'}];

function mpBytes(body) {
  const b = new Uint8Array(body.length);
  for (let i=0;i<body.length;i++) {
    const n=body.charCodeAt(i);
    if (n>255) throw new Error('App 的 HTTP 介面未保留二進位資料，無法解析此來源。');
    b[i]=n;
  }
  return b;
}
function mpUtf8(bytes) {
  let escaped='';
  for (const n of bytes) escaped+='%'+n.toString(16).padStart(2,'0');
  return decodeURIComponent(escaped);
}
function mpProto(bytes) {
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
const mpValue=(m,n,fallback)=>m[n]&&m[n].length?m[n][0]:fallback;
const mpNumber=(m,n)=>mpValue(m,n,0);
const mpText=(m,n)=>mpUtf8(mpValue(m,n,new Uint8Array(0)));
const mpMessage=(m,n)=>mpProto(mpValue(m,n,new Uint8Array(0)));
const mpMessages=(m,n)=>(m[n]||[]).map(mpProto);
function mpBase64(bytes) {
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

function mpImageMime(b) {
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'image/png';
  if(b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';
  throw new Error('網站沒有傳回可辨識的漫畫圖片');
}

function mpSession() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);});
}
function mpXor(bytes,keyHex) {
  if (!keyHex) return bytes;
  if (!/^(?:[a-fA-F0-9]{2})+$/.test(keyHex)) throw new Error('MANGA Plus 圖片參數格式已變更');
  const key=new Uint8Array(keyHex.match(/../g).map(s=>parseInt(s,16))),output=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)output[i]=bytes[i]^key[i%key.length];
  return output;
}

class DefaultExtension extends MProvider {
  base='https://mangaplus.shueisha.co.jp';
  apiBase='https://jumpg-webapi.tokyo-cdn.com/api';
  session=mpSession();
  detailCache={};
  catalog=null;
  catalogTime=0;
  imageHeaders={'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1','Referer':'https://mangaplus.shueisha.co.jp/','Origin':'https://mangaplus.shueisha.co.jp','Accept':'*/*'};
  get supportsLatest(){return true;}
  getHeaders(url){return {...this.imageHeaders};}
  async api(path,params) {
    const query=Object.keys(params||{}).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&');
    const url=this.apiBase+path+(query?'?'+query:'');
    const r=await new Client().get(url,{...this.imageHeaders,'SESSION-TOKEN':this.session});
    if(r.statusCode!==200)throw new Error('MANGA Plus '+path+' HTTP '+r.statusCode);
    let m;
    try {m=mpProto(mpBytes(r.body));} catch(_){throw new Error('MANGA Plus '+path+' 未回傳可解析的二進位資料');}
    if(m[2]){
      const popup=mpMessage(mpMessage(m,2),2),message=[mpText(popup,1),mpText(popup,2)].filter(Boolean).join(': ');
      throw new Error(message || 'MANGA Plus 此內容目前無法讀取');
    }
    if(!m[1])throw new Error('MANGA Plus 回應沒有作品資料');
    return mpMessage(m,1);
  }
  result(success,field,label){if(!success[field])throw new Error('MANGA Plus '+label+'資料格式已變更');return mpMessage(success,field);}
  title(t){return {id:mpNumber(t,1),language:mpNumber(t,7),name:mpText(t,2),imageUrl:mpText(t,4),author:mpText(t,3)};}
  list(titles) {
    const seen={},list=[];
    for(const t of titles){const item=this.title(t);if(!item.id||item.language!==0||seen[item.id])continue;seen[item.id]=true;list.push({name:item.name,imageUrl:item.imageUrl,link:this.base+'/titles/'+item.id});}
    return {list,hasNextPage:false};
  }
  async getPopular(page) {
    if(page>1)return {list:[],hasNextPage:false};
    const s=await this.api('/title_list/rankingV2',{lang:'eng',type:'hottest',clang:'eng'}),r=this.result(s,37,'排行榜');
    const titles=[];for(const rank of mpMessages(r,3))titles.push(...mpMessages(rank,2));
    return this.list(titles);
  }
  async getLatestUpdates(page) {
    if(page>1)return {list:[],hasNextPage:false};
    const s=await this.api('/web/web_homeV4',{lang:'eng',clang:'eng'}),home=this.result(s,38,'更新列表'),updates=[];
    for(const group of mpMessages(home,2))updates.push(...mpMessages(group,2));
    for(const featured of mpMessages(home,7))updates.push(...mpMessages(featured,2));
    updates.sort((a,b)=>mpNumber(b,6)-mpNumber(a,6));
    const titles=[];
    for(const update of updates)for(const latest of mpMessages(update,3))if(latest[1])titles.push(mpMessage(latest,1));
    return this.list(titles);
  }
  async search(query,page,filters) {
    if(page>1)return {list:[],hasNextPage:false};
    if(!this.catalog || Date.now()-this.catalogTime>300000){
      const s=await this.api('/title_list/allV2',{}),all=this.result(s,25,'搜尋列表');
      const titles=[];for(const group of mpMessages(all,1))titles.push(...mpMessages(group,2));
      this.catalog=titles;this.catalogTime=Date.now();
    }
    const q=String(query||'').trim().toLowerCase();
    return this.list(this.catalog.filter(t=>!q||(mpText(t,2)+' '+mpText(t,3)).toLowerCase().includes(q)));
  }
  titleId(url){const m=String(url).match(/\/titles\/(\d+)/);if(!m)throw new Error('MANGA Plus 作品網址格式不正確');return m[1];}
  async detail(id) {
    const cached=this.detailCache[id];if(cached&&Date.now()-cached.time<60000)return cached.data;
    const s=await this.api('/title_detailV3',{title_id:id,clang:'eng'}),d=this.result(s,8,'作品詳情'),title=mpMessage(d,1);
    if(mpNumber(title,7)!==0)throw new Error('此作品不是英文版本，已停止讀取');
    if(mpNumber(title,1)!==Number(id))throw new Error('MANGA Plus 回傳的作品不一致');
    this.detailCache[id]={time:Date.now(),data:d};return d;
  }
  async getDetail(url) {
    const id=this.titleId(url),detail=await this.detail(id),title=this.title(mpMessage(detail,1)),seen={},chapters=[];
    for(const group of mpMessages(detail,28)){
      const available=[...mpMessages(group,2),...mpMessages(group,4)];
      for(const ch of available){
        const cid=mpNumber(ch,2);if(!cid||!ch[4]||seen[cid])continue;seen[cid]=true;
        const num=mpText(ch,3),subtitle=mpText(ch,4);
        chapters.push({name:num+(subtitle?' — '+subtitle:''),url:this.base+'/viewer/'+cid+'?title_id='+id,dateUpload:String(mpNumber(ch,6)*1000)});
      }
    }
    const genres=mpMessages(detail,31),period=mpText(detail,7),info=mpText(detail,8);
    let status=0;if(genres.some(g=>mpText(g,2)==='one-shot')||/\bcompleted?\b/i.test(info)||/latest 0 chapters/i.test(period))status=1;else if(/on a hiatus/i.test(info))status=2;
    return {name:title.name,imageUrl:title.imageUrl,author:title.author.replace(/ \/ /g,', '),genre:genres.map(g=>mpText(g,1)).filter(Boolean),status,description:[mpText(detail,3),period].filter(Boolean).join('\n\n'),episodes:chapters.reverse(),link:this.base+'/titles/'+id};
  }
  async getPageList(url) {
    const m=String(url).match(/\/viewer\/(\d+)/);if(!m)throw new Error('MANGA Plus 章節網址格式不正確');
    const expected=String(url).match(/[?&]title_id=(\d+)/);
    const s=await this.api('/manga_viewer_v3',{chapter_id:m[1],split:'yes',img_quality:'high',clang:'eng'}),viewer=this.result(s,10,'閱讀器');
    const titleId=mpNumber(viewer,9)||(expected?Number(expected[1]):0);
    if(!titleId)throw new Error('閱讀器未提供作品識別碼');
    if(expected&&titleId!==Number(expected[1]))throw new Error('章節與作品不一致');
    await this.detail(String(titleId));
    const pages=[];for(const p of mpMessages(viewer,1))if(p[1])pages.push(mpMessage(p,1));
    if(!pages.length)throw new Error('此章節目前沒有可讀取的漫畫頁面');
    const viewToken=mpText(viewer,19),headers={...this.imageHeaders};
    if(viewToken)headers['Plus-Vw-Token']=viewToken;
    const result=new Array(pages.length);let next=0;
    const worker=async()=>{
      while(next<pages.length){
        const index=next++,page=pages[index],imageUrl=mpText(page,1);
        if(!/^https:\/\//i.test(imageUrl))throw new Error('MANGA Plus 圖片網址格式不正確');
        const r=await new Client().get(imageUrl,headers);
        if(r.statusCode!==200)throw new Error('MANGA Plus 第 '+(index+1)+' 頁 HTTP '+r.statusCode);
        const bytes=mpXor(mpBytes(r.body),mpText(page,5)),mime=mpImageMime(bytes);
        result[index]='data:'+mime+';base64,'+mpBase64(bytes);
      }
    };
    await Promise.all([worker(),worker()]);return result;
  }
  getFilterList(){return [];}
  getSourcePreferences(){return [];}
}

