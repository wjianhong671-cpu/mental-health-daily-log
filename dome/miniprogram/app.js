// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
      //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
      //   如不填则使用默认环境（第一个创建的环境）
      env: "cloud1-9gkxbnpxe248bbf1",
      // 小程序名称（用于名称解耦）
      appName: "记录助手",
      // openid 缓存
      openid: ""
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
  },
  // 获取小程序名称的工具方法
  getAppName() {
    return this.globalData.appName || "{{MINIPROGRAM_NAME}}";
  },
  // 确保 openid 已获取（全局复用）
  async ensureOpenid(force = false) {
    if (!this.globalData) this.globalData = {}
    if (!force && this.globalData.openid) {
      return this.globalData.openid
    }

    const cached = wx.getStorageSync('OPENID')
    if (!force && cached) {
      this.globalData.openid = cached
      return cached
    }

    const callOnce = async () => {
      console.log('[ensureOpenid] calling cloud function...')
      const res = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getOpenId' }
      })
      const openid = res?.result?.openid || ''
      return { res, openid }
    }

    const waits = [0, 300, 800]
    for (let i = 0; i < waits.length; i++) {
      if (waits[i]) await new Promise(r => setTimeout(r, waits[i]))
      try {
        console.log('[ensureOpenid] try=', i + 1)
        const { res, openid } = await callOnce()
        console.log('[ensureOpenid] res=', res)
        if (openid) {
          this.globalData.openid = openid
          wx.setStorageSync('OPENID', openid)
          console.log('[ensureOpenid] success, openid=', openid)
          return openid
        }
        console.warn('[ensureOpenid] openid empty, will retry')
      } catch (err) {
        console.error('[ensureOpenid] callFunction failed', err)
      }
    }
    console.error('[ensureOpenid] all retries failed, return empty string')
    return ''
  }
});
