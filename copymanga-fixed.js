// SPDX-License-Identifier: Apache-2.0
// Derived from entityJY/mangayomi-extensions-eJ/javascript/manga/src/zh/copymanga.js
// Upstream Mangayomi extensions: Copyright 2023 Moustapha Kodjo Amadou.
// Modifications: request headers, text decoding, response validation, search escaping.
// See LICENSE-copymanga.txt for the Apache License, Version 2.0.
const mangayomiSources = [{
    "name": "拷貝漫畫（修正版）",
    "lang": "zh",
    "baseUrl": "https://www.mangacopy.com",
    "apiUrl": "https://api.mangacopy.com",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.copymanga.png",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "copymanga-fixed.js"
  }];
  
  class DefaultExtension extends MProvider {
    get supportsLatest() { return true; }
    stringUTF8(text) {
      text=String(text == null ? '' : text);
      if (Array.from(text).some(c=>c.charCodeAt(0)>255)) return text;
      try {return decodeURIComponent(Array.from(text).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));}
      catch (_) {return text;}
    }

    async requestText(url, headers) {
      const res=await new Client().get(url,headers || this.reqHeaders());
      if (res.statusCode && (res.statusCode<200 || res.statusCode>=300)) throw new Error('拷貝漫畫 HTTP '+res.statusCode+'；網站與 API 可能有不同存取限制。');
      if (/Site Unavailable|Unable to access this site/i.test(res.body)) throw new Error('拷貝漫畫回傳 Site Unavailable；目前的原生請求無法存取此網址，Webview 能開啟不代表 API 已可讀。');
      return res.body;
    }

    async requestJson(url, headers) {
      const body=await this.requestText(url,headers);
      let data;
      try {data=JSON.parse(body);}
      catch (_) {throw new Error('拷貝漫畫未回傳 JSON 資料；請回報此錯誤畫面。');}
      if (!data || data.results == null) throw new Error('拷貝漫畫 API 未提供結果資料（'+(data && data.code != null ? data.code : '未知狀態')+'）。');
      return data;
    }

    base64encode(str) {
      const base64EncodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var out, i, len;
      var c1, c2, c3;
      len = str.length;
      i = 0;
      out = "";
      while (i < len) {
        c1 = str.charCodeAt(i++) & 0xff;
        if (i == len) {
          out += base64EncodeChars.charAt(c1 >> 2);
          out += base64EncodeChars.charAt((c1 & 0x3) << 4);
          out += "==";
          break;
        }
        c2 = str.charCodeAt(i++);
        if (i == len) {
          out += base64EncodeChars.charAt(c1 >> 2);
          out += base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
          out += base64EncodeChars.charAt((c2 & 0xF) << 2);
          out += "=";
          break;
        }
        c3 = str.charCodeAt(i++);
        out += base64EncodeChars.charAt(c1 >> 2);
        out += base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
        out += base64EncodeChars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
        out += base64EncodeChars.charAt(c3 & 0x3F);
      }
      return out;
    }
  
    decode(result) {
      var iv = result.substring(0, 16);
      result = result.replace(iv, "");
      const bytes = [];
      for (var i = 0; i < result.length; i = i + 2) {
        bytes.push(parseInt(result.substr(i, 2), 16));
      }
      var charString = String.fromCharCode.apply(null, bytes);
      const data = this.base64encode(charString);
      const text = cryptoHandler(data, iv, "xxxmanga.woo.key", false);
      return text;
    }
  
    getHeaders(url) {
      return {
        Referer: this.source.baseUrl
      };
    }

    reqHeaders() {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return {
        'User-Agent': 'duoTuoCartoon/3.2.4 (iPhone; iOS 18.0.1; Scale/3.00) iDOKit/1.0.0 RSSX/1.0.0',
        'version': `${year}.${month}.${day}`,
        'region': '0',
        'webp': '0',
        "platform": "1",
        "Referer": this.source.baseUrl + "/"
      }
    }
  
    async getManga(url) {
      const datas = await this.requestJson(this.source.apiUrl + url, this.reqHeaders());
      if (!Array.isArray(datas.results.list)) throw new Error("拷貝漫畫列表格式已變更");
      const manga = [];
      for (const data of datas["results"]["list"]) {
        manga.push({
          name: this.stringUTF8(data["name"]),
          imageUrl: data["cover"],
          link: data["path_word"]
        });
      }
      return {
        list: manga,
        hasNextPage: manga.length >= 16
      };
    }
  
    async getPopular(page) {
      return await this.getManga(`/api/v3/comics?free_type=1&limit=16&offset=${(page-1)*16}&ordering=-popular&_update=true`);
    }
  
    async getLatestUpdates(page) {
      return await this.getManga(`/api/v3/comics?free_type=1&limit=16&offset=${(page-1)*16}&ordering=-datetime_updated&_update=true`);
    }
  
    async search(query, page, filters) {
      if (query != "") {
        const payload = await this.requestJson(this.source.apiUrl + `/api/v3/search/comic?platform=1&q=${encodeURIComponent(query)}&limit=16&offset=${(page -1)*16}&q_type=&_update=true`, this.reqHeaders());
        const datas = payload.results.list;
        if (!Array.isArray(datas)) throw new Error('拷貝漫畫搜尋結果格式已變更');
        const manga = [];
        for (const data of datas) {
          manga.push({
            name: this.stringUTF8(data["name"]),
            imageUrl: data["cover"],
            link: data["path_word"]
          });
        }
        return {
          list: manga,
          hasNextPage: manga.length >= 16
        };
      }
      var type="", region="", sort="-popular";
      filters=filters || [];
      for (const filter of filters) {
        if (filter["type"] == "type") {
          type = filter["values"][filter["state"]]["value"];
        }
        if (filter["type"] == "region") {
          region = filter["values"][filter["state"]]["value"];
        }
        if (filter["type"] == "sort") {
          sort = filter["values"][filter["state"]]["value"];
        }
      }
      return await this.getManga(`/api/v3/comics?free_type=1&limit=16&offset=${(page-1)*16}&theme=${type}&top=${region}&ordering=${sort}&_update=true`);
    }
  
    comicPath(url) {
      const path = String(url).split('|')[0].split('?')[0].replace(/^https?:\/\/[^/]+\/(?:h5\/)?comic\//, '').replace(/^\/(?:h5\/)?comic\//, '').replace(/\/$/, '');
      if (!/^[a-zA-Z0-9_-]+$/.test(path)) throw new Error('作品網址格式不正確');
      return path;
    }

    async decodedJson(value, label) {
      if (value && typeof value === 'object') return value;
      if (typeof value !== 'string' || !value.length) throw new Error(label+'資料為空');
      const trimmed=value.replace(/^\uFEFF/, '').trim();
      if (trimmed[0]==='{' || trimmed[0]==='[') {
        try {return JSON.parse(trimmed);} catch (_) {throw new Error(label+'回傳的 JSON 不完整');}
      }
      let decoded;
      try {decoded=await this.decode(trimmed);} catch (_) {throw new Error(label+'解碼失敗');}
      try {
        let result=JSON.parse(String(decoded).replace(/^\uFEFF/, '').trim());
        if (typeof result==='string') result=JSON.parse(result);
        return result;
      } catch (_) {throw new Error(label+'解碼後不是有效 JSON，網站可能已調整資料格式');}
    }

    async apiChapters(path, groups) {
      let entries=[];
      if (Array.isArray(groups)) entries=groups.map(g=>({key:g.path_word || g.path || 'default',name:g.name || '',count:g.count}));
      else if (groups && typeof groups==='object') entries=Object.keys(groups).map(key=>({key:groups[key].path_word || key,name:groups[key].name || '',count:groups[key].count}));
      if (!entries.length) entries=[{key:'default',name:''}];
      const episodes=[],seen={};
      const limit=100;
      for (const group of entries) {
        if (group.count===0) continue;
        let offset=0;
        while (true) {
          const result=await this.requestJson(this.source.apiUrl+'/api/v3/comic/'+encodeURIComponent(path)+'/group/'+encodeURIComponent(group.key)+'/chapters?limit='+limit+'&offset='+offset+'&platform=1',this.reqHeaders());
          const data=result.results;
          if (!data || !Array.isArray(data.list)) throw new Error('章節 API 未回傳章節列表');
          let added=0;
          for (const ch of data.list) {
            const id=ch.uuid || ch.id;
            if (!id) throw new Error('章節 API 未提供章節識別碼');
            if (seen[id]) continue;
            seen[id]=true;added++;
            const prefix=group.key!=='default' && group.name ? '['+this.stringUTF8(group.name)+'] ' : '';
            episodes.push({name:prefix+this.stringUTF8(ch.name || ch.title || '未命名章節'),url:path+'|'+id});
          }
          if (!data.list.length) break;
          if (!added) throw new Error('章節 API 重複回傳同一分頁，已停止避免漏章');
          offset+=data.list.length;
          const total=data.total==null ? NaN : Number(data.total);
          if (Number.isFinite(total) && offset>=total) break;
          if (!Number.isFinite(total) && data.list.length<limit) break;
        }
      }
      if (!episodes.length) throw new Error('章節 API 沒有可讀取章節');
      return episodes.reverse();
    }

    async webChapters(path) {
      const payload=await this.requestJson(this.source.baseUrl+'/comicdetail/'+encodeURIComponent(path)+'/chapters',this.browserHeaders());
      const data=await this.decodedJson(payload.results,'網頁章節清單');
      const groups=data.groups || {};
      const result=[],seen={};
      for (const key of Object.keys(groups)) {
        for (const ch of groups[key].chapters || []) {
          const id=ch.id || ch.uuid;
          if (!id || seen[id]) continue;
          seen[id]=true;
          result.push({name:this.stringUTF8(ch.name || ch.title || '未命名章節'),url:path+'|'+id});
        }
      }
      if (!result.length) throw new Error('網頁備援沒有取得章節');
      return result.reverse();
    }

    browserHeaders() {
      return {'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1','Referer':this.source.baseUrl+'/'};
    }

    async getDetail(url) {
      const path=this.comicPath(url);
      const payload=await this.requestJson(this.source.apiUrl+'/api/v3/comic2/'+encodeURIComponent(path)+'?platform=1',this.reqHeaders());
      const data=payload.results.comic;
      if (!data) throw new Error('作品詳情 API 沒有回傳作品');
      let episodes;
      try {episodes=await this.apiChapters(path,payload.results.groups);}
      catch (apiError) {
        try {episodes=await this.webChapters(path);}
        catch (webError) {throw new Error('章節載入失敗。API：'+apiError.message+'；網頁備援：'+webError.message);}
      }
      return {
        name:this.stringUTF8(data.name),imageUrl:data.cover || '',description:this.stringUTF8(data.brief || ''),
        author:(data.author || []).map(a=>this.stringUTF8(a.name)).join(','),
        status:data.status && data.status.value!=null ? data.status.value : 5,
        genre:(data.theme || []).map(t=>this.stringUTF8(t.name)),episodes,link:'/comic/'+path
      };
    }

    orderImages(chapter) {
      const contents=chapter && chapter.contents;
      if (!Array.isArray(contents) || !contents.length) throw new Error('圖片 API 沒有回傳圖片清單');
      const urls=contents.map(x=>typeof x==='string'?x:x.url);
      if (urls.some(x=>typeof x!=='string' || !/^https?:\/\//.test(x))) throw new Error('圖片 API 回傳的網址格式不正確');
      const words=chapter.words;
      if (!Array.isArray(words) || !words.length) return urls;
      if (words.length!==urls.length) throw new Error('圖片頁碼數量與圖片數量不一致');
      const result=new Array(urls.length),seen={};
      for (let i=0;i<words.length;i++) {
        const page=Number(words[i]);
        if (!Number.isInteger(page) || page<0 || page>=urls.length || seen[page]) throw new Error('圖片頁碼資料格式已變更');
        seen[page]=true;result[page]=urls[i];
      }
      return result;
    }

    async getPageList(url) {
      const parts=String(url).split('|'),path=this.comicPath(parts[0]),id=parts[1];
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('章節網址格式不正確');
      try {
        const payload=await this.requestJson(this.source.apiUrl+'/api/v3/comic/'+encodeURIComponent(path)+'/chapter2/'+encodeURIComponent(id)+'?platform=1',this.reqHeaders());
        return this.orderImages(payload.results.chapter);
      } catch (apiError) {
        try {
          const html=await this.requestText(this.source.baseUrl+'/comic/'+encodeURIComponent(path)+'/chapter/'+encodeURIComponent(id),this.browserHeaders());
          const match=html.match(/contentKey\s*=\s*["']([^"']+)["']/);
          if (!match) throw new Error('網頁沒有提供圖片清單');
          const decoded=await this.decodedJson(match[1],'網頁圖片清單');
          const images=Array.isArray(decoded)?decoded:decoded.contents;
          if (!Array.isArray(images) || !images.length) throw new Error('網頁圖片清單為空');
          return this.orderImages({contents:images});
        } catch (webError) {throw new Error('圖片載入失敗。API：'+apiError.message+'；網頁備援：'+webError.message);}
      }
    }

    getFilterList() {
      return [{
          type: "type",
          name: "分类",
          type_name: "SelectFilter",
          values: [{
              type_name: "SelectOption",
              name: "全部",
              value: ""
            },
            {
              type_name: "SelectOption",
              name: "愛情",
              value: "aiqing"
            },
            {
              type_name: "SelectOption",
              name: "歡樂向",
              value: "huanlexiang"
            },
            {
              type_name: "SelectOption",
              name: "冒险",
              value: "maoxian"
            },
            {
              type_name: "SelectOption",
              name: "奇幻",
              value: "qihuan"
            },
            {
              type_name: "SelectOption",
              name: "百合",
              value: "baihe"
            },
            {
              type_name: "SelectOption",
              name: "校园",
              value: "xiaoyuan"
            },
            {
              type_name: "SelectOption",
              name: "科幻",
              value: "kehuan"
            },
            {
              type_name: "SelectOption",
              name: "東方",
              value: "dongfang"
            },
            {
              type_name: "SelectOption",
              name: "生活",
              value: "shenghuo"
            },
            {
              type_name: "SelectOption",
              name: "轻小说",
              value: "qingxiaoshuo"
            },
            {
              type_name: "SelectOption",
              name: "格鬥",
              value: "gedou"
            },
            {
              type_name: "SelectOption",
              name: "耽美",
              value: "danmei"
            },
            {
              type_name: "SelectOption",
              name: "悬疑",
              value: "xuanyi"
            },
            {
              type_name: "SelectOption",
              name: "神鬼",
              value: "shengui"
            },
            {
              type_name: "SelectOption",
              name: "其他",
              value: "qita"
            },
            {
              type_name: "SelectOption",
              name: "职场",
              value: "zhichang"
            },
            {
              type_name: "SelectOption",
              name: "萌系",
              value: "mengxi"
            },
            {
              type_name: "SelectOption",
              name: "治愈",
              value: "zhiyu"
            },
            {
              type_name: "SelectOption",
              name: "長條",
              value: "changtiao"
            },
            {
              type_name: "SelectOption",
              name: "四格",
              value: "sige"
            },
            {
              type_name: "SelectOption",
              name: "舰娘",
              value: "jianniang"
            },
            {
              type_name: "SelectOption",
              name: "节操",
              value: "jiecao"
            },
            {
              type_name: "SelectOption",
              name: "TL",
              value: "teenslove"
            },
            {
              type_name: "SelectOption",
              name: "竞技",
              value: "jingji"
            },
            {
              type_name: "SelectOption",
              name: "搞笑",
              value: "gaoxiao"
            },
            {
              type_name: "SelectOption",
              name: "伪娘",
              value: "weiniang"
            },
            {
              type_name: "SelectOption",
              name: "热血",
              value: "rexue"
            },
            {
              type_name: "SelectOption",
              name: "後宮",
              value: "hougong"
            },
            {
              type_name: "SelectOption",
              name: "美食",
              value: "meishi"
            },
            {
              type_name: "SelectOption",
              name: "性转换",
              value: "xingzhuanhuan"
            },
            {
              type_name: "SelectOption",
              name: "侦探",
              value: "zhentan"
            },
            {
              type_name: "SelectOption",
              name: "励志",
              value: "lizhi"
            },
            {
              type_name: "SelectOption",
              name: "AA",
              value: "aa"
            },
            {
              type_name: "SelectOption",
              name: "彩色",
              value: "COLOR"
            },
            {
              type_name: "SelectOption",
              name: "音乐舞蹈",
              value: "yinyuewudao"
            },
            {
              type_name: "SelectOption",
              name: "异世界",
              value: "yishijie"
            },
            {
              type_name: "SelectOption",
              name: "战争",
              value: "zhanzheng"
            },
            {
              type_name: "SelectOption",
              name: "历史",
              value: "lishi"
            },
            {
              type_name: "SelectOption",
              name: "机战",
              value: "jizhan"
            },
            {
              type_name: "SelectOption",
              name: "惊悚",
              value: "jingsong"
            },
            {
              type_name: "SelectOption",
              name: "C99",
              value: "comiket99"
            },
            {
              type_name: "SelectOption",
              name: "恐怖",
              value: "恐怖"
            },
            {
              type_name: "SelectOption",
              name: "都市",
              value: "dushi"
            },
            {
              type_name: "SelectOption",
              name: "C97",
              value: "comiket97"
            },
            {
              type_name: "SelectOption",
              name: "穿越",
              value: "chuanyue"
            },
            {
              type_name: "SelectOption",
              name: "C96",
              value: "comiket96"
            },
            {
              type_name: "SelectOption",
              name: "重生",
              value: "chongsheng"
            },
            {
              type_name: "SelectOption",
              name: "魔幻",
              value: "mohuan"
            },
            {
              type_name: "SelectOption",
              name: "宅系",
              value: "zhaixi"
            },
            {
              type_name: "SelectOption",
              name: "武侠",
              value: "wuxia"
            },
            {
              type_name: "SelectOption",
              name: "C98",
              value: "C98"
            },
            {
              type_name: "SelectOption",
              name: "生存",
              value: "shengcun"
            },
            {
              type_name: "SelectOption",
              name: "C95",
              value: "comiket95"
            },
            {
              type_name: "SelectOption",
              name: "FATE",
              value: "fate"
            },
            {
              type_name: "SelectOption",
              name: "無修正",
              value: "Uncensored"
            },
            {
              type_name: "SelectOption",
              name: "转生",
              value: "zhuansheng"
            },
            {
              type_name: "SelectOption",
              name: "LoveLive",
              value: "loveLive"
            },
            {
              type_name: "SelectOption",
              name: "男同",
              value: "nantong"
            },
            {
              type_name: "SelectOption",
              name: "仙侠",
              value: "xianxia"
            },
            {
              type_name: "SelectOption",
              name: "玄幻",
              value: "xuanhuan"
            },
            {
              type_name: "SelectOption",
              name: "真人",
              value: "zhenren"
            },
          ],
        },
        {
          type: "region",
          name: "地区",
          type_name: "SelectFilter",
          values: [{
              type_name: "SelectOption",
              name: "全部",
              value: ""
            },
            {
              type_name: "SelectOption",
              name: "日本",
              value: "japan"
            },
            {
              type_name: "SelectOption",
              name: "韩国",
              value: "korea"
            },
            {
              type_name: "SelectOption",
              name: "欧美",
              value: "west"
            },
            {
              type_name: "SelectOption",
              name: "完结",
              value: "finish"
            },
          ],
        },
        {
          type: "sort",
          name: "排序",
          type_name: "SelectFilter",
          values: [{
              type_name: "SelectOption",
              name: "更新时间⬇️",
              value: "-datetime_updated"
            },
            {
              type_name: "SelectOption",
              name: "更新时间⬆️",
              value: "datetime_updated"
            },
            {
              type_name: "SelectOption",
              name: "热度⬇️",
              value: "-popular"
            },
            {
              type_name: "SelectOption",
              name: "热度⬆️",
              value: "popular"
            },
          ],
        },
      ];
    }
  
    getSourcePreferences() {
      return [];
    }
  }
