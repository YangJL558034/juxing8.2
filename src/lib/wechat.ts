const APPID = process.env.WECHAT_APP_ID || 'wx460dd08088bd55a5';
const SECRET = process.env.WECHAT_APP_SECRET || '';

export interface Code2SessionResult {
  openid?: string;
  sessionKey?: string;
  unionid?: string;
  error?: string;
  notConfigured?: boolean;
}

/** 用 wx.login 拿到的 code 换 openid（AppSecret 只能放服务端环境变量） */
export async function code2Session(code: string): Promise<Code2SessionResult> {
  if (!SECRET) {
    return { error: 'WECHAT_APP_SECRET 未配置', notConfigured: true };
  }
  if (!code) {
    return { error: '缺少登录 code' };
  }
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const response = await fetch(url, { cache: 'no-store' });
    const json = await response.json() as {
      openid?: string;
      session_key?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (json.errcode) {
      return { error: json.errmsg || `微信接口错误 ${json.errcode}` };
    }
    if (!json.openid) {
      return { error: '微信未返回 openid' };
    }
    return { openid: json.openid, sessionKey: json.session_key, unionid: json.unionid };
  } catch (error) {
    console.error('code2Session error:', error);
    return { error: '请求微信接口失败' };
  }
}
