Page({
  data: {
    // -------- 基础 --------
    mood: null,
    records: [],
    todayDate: '',
    hasTodayRecord: false,

    // -------- 睡眠 --------
    sleepQuality: null,
    sleepIssues: [],
    sleepIssuesMap: {
      insomnia: false,
      early_wake: false,
      dreams: false,
      daytime_sleepy: false,
      none: false
    },

    // -------- 用药方案（来自 med_plan）--------
    hasPlan: false,
    plan: null,
    requiredTimes: [], // 方案建议顿次（可能是 morning/noon/night 的子集）
    requiredTimesMap: { morning: false, noon: false, night: false },
    requiredTimesText: '未设置方案',

    // -------- 今天用药情况（固定早/中/晚，不少中午）--------
    takeMedMap: { morning: false, noon: false, night: false },

    // -------- 不适/副作用 --------
    sideEffects: [],
    sideEffectsMap: {
      sleepy: false,
      dizzy: false,
      nausea: false,
      anxiety: false,
      tremor: false,
      palpitation: false,
      rash: false,
      appetite: false,
      constipation: false,
      other: false,
      none: false
    },
    sideEffectSeverity: null, // 0/1/2/3
    sideEffectNote: ''
  },

  onLoad() {
    const todayDate = new Date().toISOString().slice(0, 10)
    this.setData({ todayDate })

    // 先拉方案（影响“今天用药情况”提示），再拉记录
    this.loadPlan().finally(() => {
      this.loadRecords()
    })
  },

  onShow() {
    // 从 plan 页返回时刷新方案
    this.loadPlan().catch(() => {})
  },

  // 去用药方案页
  goPlan() {
    wx.navigateTo({ url: '/pages/plan/plan' })
  },

  // 去时间轴页
  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' })
  },

  // -------- 交互：情绪/睡眠 --------

  selectMood(e) {
    const mood = Number(e.currentTarget.dataset.mood)
    this.setData({ mood })
  },

  onSleepQualityChange(e) {
    const val = Number(e.detail.value)
    this.setData({ sleepQuality: val })
  },

  onSleepIssuesChange(e) {
    const values = e.detail.value || []

    // 规则：选了 none，则清空其他；选了其他则取消 none
    let finalValues = values
    if (values.includes('none') && values.length > 1) {
      finalValues = ['none']
    } else if (!values.includes('none')) {
      finalValues = values
    }

    const map = {
      insomnia: finalValues.includes('insomnia'),
      early_wake: finalValues.includes('early_wake'),
      dreams: finalValues.includes('dreams'),
      daytime_sleepy: finalValues.includes('daytime_sleepy'),
      none: finalValues.includes('none')
    }

    this.setData({
      sleepIssues: finalValues,
      sleepIssuesMap: map
    })
  },

  // -------- 交互：今天用药情况（固定早/中/晚）--------

  onTakeMedChange(e) {
    const values = e.detail.value || []
    const map = {
      morning: values.includes('morning'),
      noon: values.includes('noon'),
      night: values.includes('night')
    }
    this.setData({ takeMedMap: map })
  },

  // -------- 交互：不适/副作用 --------

  onSideEffectsChange(e) {
    const values = e.detail.value || []

    let finalValues = values
    if (values.includes('none') && values.length > 1) {
      finalValues = ['none']
    } else if (!values.includes('none')) {
      finalValues = values
    }

    const map = {
      sleepy: finalValues.includes('sleepy'),
      dizzy: finalValues.includes('dizzy'),
      nausea: finalValues.includes('nausea'),
      anxiety: finalValues.includes('anxiety'),
      tremor: finalValues.includes('tremor'),
      palpitation: finalValues.includes('palpitation'),
      rash: finalValues.includes('rash'),
      appetite: finalValues.includes('appetite'),
      constipation: finalValues.includes('constipation'),
      other: finalValues.includes('other'),
      none: finalValues.includes('none')
    }

    const nextData = {
      sideEffects: finalValues,
      sideEffectsMap: map
    }

    // 若选“没有”，清空严重度与备注，避免矛盾
    if (finalValues.includes('none')) {
      nextData.sideEffectSeverity = null
      nextData.sideEffectNote = ''
    }

    this.setData(nextData)
  },

  onSideEffectSeverityChange(e) {
    const val = Number(e.detail.value)
    this.setData({ sideEffectSeverity: val })
  },

  onSideEffectNoteInput(e) {
    this.setData({ sideEffectNote: e.detail.value || '' })
  },

  // -------- 读取用药方案（med_plan）--------

  loadPlan() {
    const db = wx.cloud.database()

    return db.collection('med_plan')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (!list.length) {
          this.setData({
            hasPlan: false,
            plan: null,
            requiredTimes: [],
            requiredTimesMap: { morning: false, noon: false, night: false },
            requiredTimesText: '未设置方案'
          })
          return
        }

        const plan = list[0]
        const requiredTimes = this._deriveRequiredTimes(plan)
        const requiredTimesMap = {
          morning: requiredTimes.includes('morning'),
          noon: requiredTimes.includes('noon'),
          night: requiredTimes.includes('night')
        }

        this.setData({
          hasPlan: true,
          plan,
          requiredTimes,
          requiredTimesMap,
          requiredTimesText: requiredTimes.length ? this._timesToText(requiredTimes) : '（方案未填写顿次）'
        })
      })
      .catch(err => {
        console.error('loadPlan error:', err)
        this.setData({
          hasPlan: false,
          plan: null,
          requiredTimes: [],
          requiredTimesMap: { morning: false, noon: false, night: false },
          requiredTimesText: '读取方案失败'
        })
      })
  },

  // -------- 保存每日记录（同日 update / 无则 add）--------

  saveRecord() {
    if (this.data.mood === null) {
      wx.showToast({ title: '请先选择心情', icon: 'none' })
      return
    }
    if (this.data.sleepQuality === null) {
      wx.showToast({ title: '请先选择睡眠质量', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const db = wx.cloud.database()
    const now = new Date()
    const dateStr = this.data.todayDate || now.toISOString().slice(0, 10)
    const timeText = now.toLocaleString()

    // 今天用药情况文本（固定早/中/晚，且可标记“额外记录”）
    const takeMedText = this._takeMedToText(
      this.data.takeMedMap,
      this.data.requiredTimesMap,
      this.data.hasPlan
    )

    // 不适/副作用文本
    const sideEffectsText = this._sideEffectsToText(this.data.sideEffects || [])

    // 方案快照：永远写对象（不写 null，避免历史类型坑）
    const planSnapshot = this.data.hasPlan && this.data.plan
      ? this._makePlanSnapshot(this.data.plan)
      : {}

    const payload = {
      mood: this.data.mood,

      sleepQuality: this.data.sleepQuality,
      sleepIssues: this.data.sleepIssues,

      // 今天用药情况
      takeMedMap: this.data.takeMedMap,
      takeMedText,

      // 不适/副作用
      sideEffects: this.data.sideEffects,
      sideEffectsText,
      sideEffectSeverity: this.data.sideEffectSeverity,
      sideEffectNote: this.data.sideEffectNote,

      // 方案快照
      planSnapshot
    }

    db.collection('daily_records')
      .where({ date: dateStr })
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []

        if (list.length > 0) {
          const docId = list[0]._id
          this.setData({ hasTodayRecord: true })
          return db.collection('daily_records').doc(docId).update({
            data: {
              ...payload,
              updatedAt: now,
              updatedTimeText: timeText
            }
          })
        }

        this.setData({ hasTodayRecord: true })
        return db.collection('daily_records').add({
          data: {
            ...payload,
            date: dateStr,
            createdAt: now,
            timeText
          }
        })
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })

        // 清空输入（第二天继续）
        this.setData({
          mood: null,

          sleepQuality: null,
          sleepIssues: [],
          sleepIssuesMap: {
            insomnia: false,
            early_wake: false,
            dreams: false,
            daytime_sleepy: false,
            none: false
          },

          takeMedMap: { morning: false, noon: false, night: false },

          sideEffects: [],
          sideEffectsMap: {
            sleepy: false,
            dizzy: false,
            nausea: false,
            anxiety: false,
            tremor: false,
            palpitation: false,
            rash: false,
            appetite: false,
            constipation: false,
            other: false,
            none: false
          },
          sideEffectSeverity: null,
          sideEffectNote: ''
        })

        this.loadRecords()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('saveRecord error:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
  },

  // -------- 读取最近记录 --------

  loadRecords() {
    const db = wx.cloud.database()
    db.collection('daily_records')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
      .then(res => {
        const records = (res.data || []).map(r => this._decorateRecord(r))
        const today = this.data.todayDate
        const hasTodayRecord = records.some(r => r.date === today)
        this.setData({ records, hasTodayRecord })
      })
      .catch(err => {
        console.error('loadRecords error:', err)
        wx.showToast({ title: '读取失败', icon: 'none' })
      })
  },

  // -------- helpers：装饰展示字段（避免页面显示 undefined）--------

  _decorateRecord(r) {
    return {
      ...r,
      sleepIssuesText: r.sleepIssuesText || this._sleepIssuesToText(r.sleepIssues || []),
      sideEffectsText: r.sideEffectsText || this._sideEffectsToText(r.sideEffects || []),
      sideEffectSeverityText: this._severityToText(r.sideEffectSeverity),
      timeText: r.timeText || r.updatedTimeText || ''
    }
  },

  // 从方案中推导“建议顿次”
  _deriveRequiredTimes(plan) {
    const meds = (plan && Array.isArray(plan.meds)) ? plan.meds : []
    const set = new Set()

    meds.forEach(m => {
      const times = Array.isArray(m.times) ? m.times : []
      times.forEach(t => set.add(t))
    })

    // 固定顺序输出
    const order = ['morning', 'noon', 'night']
    return order.filter(x => set.has(x))
  },

  _timesToText(times) {
    const map = { morning: '早', noon: '中', night: '晚' }
    const arr = Array.isArray(times) ? times : []
    return arr.length ? arr.map(t => map[t] || t).join('、') : '无'
  },

  // ✅ 今天用药情况文本：固定早/中/晚，并标记“额外记录”
  _takeMedToText(takeMedMap, requiredTimesMap, hasPlan) {
    const map = { morning: '早', noon: '中', night: '晚' }
    const order = ['morning', 'noon', 'night']

    const base = order
      .map(k => `${map[k]}${takeMedMap && takeMedMap[k] ? '✓' : '✗'}`)
      .join(' ')

    if (hasPlan && requiredTimesMap) {
      const extra = order.filter(k => (takeMedMap && takeMedMap[k]) && !requiredTimesMap[k])
      if (extra.length) {
        return `${base}（额外记录：${extra.map(k => map[k]).join('、')}）`
      }
    }

    return base
  },

  _sleepIssuesToText(arr) {
    const map = {
      insomnia: '入睡困难',
      early_wake: '早醒',
      dreams: '多梦/噩梦',
      daytime_sleepy: '白天嗜睡',
      none: '无'
    }
    const a = Array.isArray(arr) ? arr : []
    if (!a.length) return '未填写'
    if (a.includes('none')) return '无'
    return a.map(x => map[x] || x).join('、')
  },

  _sideEffectsToText(arr) {
    const map = {
      sleepy: '嗜睡/发困',
      dizzy: '头晕',
      nausea: '恶心/胃不适',
      anxiety: '焦虑/坐立不安',
      tremor: '手抖',
      palpitation: '心悸/心跳快',
      rash: '皮疹/瘙痒',
      appetite: '食欲增加',
      constipation: '便秘',
      other: '其他',
      none: '没有'
    }
    const a = Array.isArray(arr) ? arr : []
    if (!a.length) return '未填写'
    if (a.includes('none')) return '没有'
    return a.map(x => map[x] || x).join('、')
  },

  _severityToText(v) {
    const map = { 0: '不明显', 1: '轻度', 2: '中度', 3: '重度' }
    if (v === null || v === undefined || v === '') return '未选择'
    return map[v] || String(v)
  },

  // 方案快照：只保留关键字段，避免过大/过杂
  _makePlanSnapshot(plan) {
    const meds = Array.isArray(plan.meds) ? plan.meds : []
    return {
      meds: meds.map(m => ({
        name: m.name || '',
        doseMgPerDay: m.doseMgPerDay || m.dose || '',
        unit: m.unit || 'mg',
        times: Array.isArray(m.times) ? m.times : [],
        note: m.note || ''
      })),
      nextVisitDate: plan.nextVisitDate || '',
      needLabTags: Array.isArray(plan.needLabTags) ? plan.needLabTags : [],
      updatedTimeText: plan.updatedTimeText || ''
    }
  }
})