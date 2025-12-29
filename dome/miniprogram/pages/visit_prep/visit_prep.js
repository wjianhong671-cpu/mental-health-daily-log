Page({
  data: {
    concern1: '',
    concern2: '',
    goals: [], // 存数据库：数组
    goalsMap: { side_effect: false, improve: false, relapse: false, other: false }, // 控制 UI：布尔 map
    goalOther: '',
    lastSavedText: '',
    loading: false
  },

  onLoad() {
    this.loadLatest()
  },

  // -------- 输入绑定 --------
  onConcern1Input(e) {
    this.setData({ concern1: (e.detail.value || '').trimStart() })
  },
  onConcern2Input(e) {
    this.setData({ concern2: (e.detail.value || '').trimStart() })
  },
  onGoalOtherInput(e) {
    this.setData({ goalOther: (e.detail.value || '').trimStart() })
  },

  // checkbox-group 只返回 value 数组（关键：要把它写回 data）
  onGoalsChange(e) {
    const values = e.detail.value || []
    const goalsMap = {
      side_effect: values.includes('side_effect'),
      improve: values.includes('improve'),
      relapse: values.includes('relapse'),
      other: values.includes('other')
    }

    const next = { goals: values, goalsMap }

    // 取消 other 时自动清空“其他说明”
    if (!goalsMap.other) next.goalOther = ''

    this.setData(next)
  },

  // -------- 数据库：读取最新一条 --------
  async loadLatest() {
    const db = wx.cloud.database()
    this.setData({ loading: true })

    try {
      const res = await db.collection('visit_prep')
        .where({ _openid: db.command.exists(true) }) // 兼容；实际查询会自动带 _openid
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get()

      const list = res.data || []
      if (!list.length) {
        this.setData({ loading: false })
        return
      }

      const doc = list[0]
      const goals = Array.isArray(doc.goals) ? doc.goals : []
      const goalsMap = {
        side_effect: goals.includes('side_effect'),
        improve: goals.includes('improve'),
        relapse: goals.includes('relapse'),
        other: goals.includes('other')
      }

      this.setData({
        concern1: doc.concern1 || '',
        concern2: doc.concern2 || '',
        goals,
        goalsMap,
        goalOther: doc.goalOther || '',
        lastSavedText: doc.updatedTimeText || '',
        loading: false
      })
    } catch (err) {
      // 集合不存在 / 权限问题等
      console.error('loadLatest error:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '读取失败（可先保存一次）', icon: 'none' })
    }
  },

  // -------- 保存（有则 update，无则 add）--------
  async onSave() {
    const concern1 = (this.data.concern1 || '').trim()
    if (!concern1) {
      wx.showToast({ title: '请先填写问题 1', icon: 'none' })
      return
    }

    // other 勾选但没写说明 -> 允许保存，但提示更好
    if (this.data.goalsMap.other && !(this.data.goalOther || '').trim()) {
      wx.showToast({ title: '已勾选“其他”，建议补充说明', icon: 'none' })
      // 不 return，允许继续保存
    }

    const db = wx.cloud.database()
    const now = new Date()
    const updatedTimeText = now.toLocaleString()

    wx.showLoading({ title: '保存中...' })

    try {
      // 找到自己最新一条（按 _openid + updatedAt）
      const res = await db.collection('visit_prep')
        .where({ _openid: db.command.exists(true) })
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get()

      const payload = {
        concern1: (this.data.concern1 || '').trim(),
        concern2: (this.data.concern2 || '').trim(),
        goals: Array.isArray(this.data.goals) ? this.data.goals : [],
        goalOther: (this.data.goalOther || '').trim(),
        updatedAt: now,
        updatedTimeText
      }

      const list = res.data || []
      if (list.length) {
        const docId = list[0]._id
        await db.collection('visit_prep').doc(docId).update({ data: payload })
      } else {
        await db.collection('visit_prep').add({ data: payload })
      }

      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ lastSavedText: updatedTimeText })
    } catch (err) {
      wx.hideLoading()
      console.error('save error:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})