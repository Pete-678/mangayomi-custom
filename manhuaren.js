// Manhuaren experimental source v0.1.0. No server-side reader required.
const mangayomiSources = [{name:"漫畫人（測試版）",lang:"zh",baseUrl:"https://www.manhuaren.com",apiUrl:"",iconUrl:"https://www.manhuaren.com/favicon.ico",typeSource:"single",itemType:0,isNsfw:false,version:"0.1.0",dateFormat:"",dateFormatLocale:"",pkgPath:"manhuaren.js"}];

// Parse only the known packed string format; never execute website scripts.
function unpackManhuaren(html) {
  const m = html.match(/\}\('((?:\\.|[^'\\])*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/);
  if (!m) return html;
  const radix = Number(m[2]), count = Number(m[3]);
  if (radix < 2 || radix > 62 || count > 100000) throw new Error('不支援的圖片清單格式');
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const encode = n => (n >= radix ? encode(Math.floor(n / radix)) : '') + alphabet[n % radix];
  const words = m[4].split('|'), dict = {};
  for (let i=0;i<count;i++) if(words[i]) dict[encode(i)] = words[i];
  return m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\b\w+\b/g, token => dict[token] || token);
}
function manhuarenPages(html) {
  const decoded = unpackManhuaren(html);
  const array = decoded.match(/(?:var\s+)?newImgs\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!array) throw new Error('找不到圖片清單；此章節可能需要登入、受限制，或網站格式已變更。');
  const result = [], regex = /(['"])(https?:\/\/[^'"\s]+)\1/g;
  let m;
  while ((m=regex.exec(array[1])) !== null) result.push(m[2].replace(/&amp;/g,'&'));
  if (!result.length) throw new Error('此章節沒有可讀取的圖片');
  return result;
}
class DefaultExtension extends MProvider {
  base = 'https://www.manhuaren.com';
  headers = {'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','Referer':'https://www.manhuaren.com/'};
  absolute(value) {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('//')) return 'https:' + value;
    return this.base + '/' + value.replace(/^\//,'');
  }
  getHeaders(url) { return {...this.headers}; }
  async request(path) {
    const r = await new Client().get(this.absolute(path), this.headers);
    if (r.statusCode && r.statusCode >= 400) throw new Error('漫畫人回應 HTTP ' + r.statusCode);
    return r.body;
  }
  async post(path, data, referer) {
    const body = Object.keys(data).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(data[k])).join('&');
    const r = await new Client().post(this.absolute(path), {...this.headers,'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest','Referer':this.absolute(referer)}, body);
    let parsed;
    try { parsed = JSON.parse(r.body.replace(/^\uFEFF/,'')); }
    catch (_) { throw new Error('漫畫人沒有回傳預期的列表資料，請用內建瀏覽器檢查網站。'); }
    return parsed;
  }
  async browse(page, sort) {
    const referer = sort === 2 ? '/manhua-list-s2/' : '/manhua-list/';
    if (page === 1) {
      const doc = new Document(await this.request(referer));
      const list = doc.select('.manga-list-2 li').map(el => ({name:el.selectFirst('.manga-list-2-title').text.trim(),link:this.absolute(el.selectFirst('a').attr('href').split('?')[0]),imageUrl:this.absolute(el.selectFirst('img').attr('src'))}));
      return {list,hasNextPage:list.length >= 21};
    }
    const data = await this.post(referer+'dm5.ashx',{action:'getclasscomics',pageindex:page,pagesize:21,categoryid:0,tagid:0,status:0,usergroup:0,pay:-1,areaid:0,sort,iscopyright:0},referer);
    const items = data.UpdateComicItems;
    if (!Array.isArray(items)) throw new Error('漫畫列表格式已變更');
    return {list:items.map(x=>({name:x.Title,link:this.absolute('/'+x.UrlKey+'/'),imageUrl:this.absolute(x.ShowPicUrlB)})),hasNextPage:items.length >= 21};
  }
  async getPopular(page) { return this.browse(page,10); }
  async getLatestUpdates(page) { return this.browse(page,2); }
  async search(query,page,filters) {
    if (!query.trim()) return this.getPopular(page);
    const path = '/search?title='+encodeURIComponent(query);
    if (page===1) {
      const doc = new Document(await this.request(path));
      const list = doc.select('.book-list li').map(el=>({name:el.selectFirst('.book-list-info-title').text.trim(),link:this.absolute(el.selectFirst('a').attr('href')),imageUrl:this.absolute(el.selectFirst('img').attr('src'))}));
      return {list,hasNextPage:list.length >= 10};
    }
    const items = await this.post('/pagerdata.ashx',{t:7,pageindex:page,f:0,title:query},path);
    if (!Array.isArray(items)) throw new Error('搜尋結果格式已變更');
    return {list:items.filter(x=>x.Url).map(x=>({name:x.Title,link:this.absolute(x.Url),imageUrl:this.absolute(x.Pic)})),hasNextPage:items.length >= 10};
  }
  async getDetail(url) {
    const doc = new Document(await this.request(url));
    const text = selector => {const el=doc.selectFirst(selector);return el ? el.text.trim() : '';};
    const seen={}, episodes=[];
    for (const a of doc.select('a.chapteritem')) {
      const href=a.attr('href');
      if (!/^\/m\d+\/$/.test(href) || seen[href]) continue;
      seen[href]=true;episodes.push({name:a.text.trim(),url:this.absolute(href)});
    }
    if (!text('.detail-main-info-title')) throw new Error('作品頁面無法讀取，請檢查網站存取狀態。');
    const cover=doc.selectFirst('.detail-main-cover img');
    return {name:text('.detail-main-info-title'),imageUrl:cover?this.absolute(cover.attr('src')):'',description:text('.detail-desc'),author:text('.detail-main-info-author').replace(/^作者[：:]\s*/,''),genre:doc.select('.detail-main-info-class a').map(a=>a.text.trim()),status:text('.detail-list-title-1').includes('完结')?1:0,episodes};
  }
  async getPageList(url) {
    const chapter=this.absolute(url), pages=manhuarenPages(await this.request(chapter));
    return pages.map(url=>({url,headers:{...this.headers,Referer:chapter}}));
  }
  getFilterList() { return []; }
  getSourcePreferences() { return []; }
}
