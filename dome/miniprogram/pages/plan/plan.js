Page({
  data: {
    medOptions: [
      { name: '阿立哌唑' },
      { name: '喹硫平' },
      { name: '奥氮平' },
      { name: '利培酮' },
      { name: '丙戊酸镁' },
      { name: '碳酸锂' },
      { name: '拉莫三嗪' },
      { name: '舍曲林' },
      { name: '文拉法辛' }
    ],

    meds: [],
    nextVisitDate: '',

    savedPlan: null
  },

  onLoad() {
    // 默认先放一条，降低用户“无从下手”的焦虑
    this.setData({
      meds: [this._emptyMed()]
    })
    this.loadSavedPlan()
  },

  // ----------- UI handlers -----------

  addMed() {
    const meds = (this.data.meds || []).slice()
    meds.push(this._emptyMed())
    this.setData({ meds })
  },

  removeMed(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const meds = (this.data.meds || []).slice()
    meds.splice(idx, 1)
    if (meds.length === 0) meds.push(this._emptyMed())
    this.setData({ meds })
  },

  onMedPick(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const pickIndex = Number(e.detail.value)
    const option = (this.data.medOptions || [])[pickIndex]

    const meds = (this.data.meds || []).slice()
    meds[idx].name = option ? option.name : ''
    this.setData({ meds })
  },

  onDoseInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const val = e.detail.value
    const meds = (this.data.meds || []).slice()
    meds[idx].doseMg = val
    this.setData({ meds })
  },

  onTimesChange(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const values = e.detail.value || []

    const timesMap = {
      morning: values.includes('morning'),
      noon: values.includes('noon'),
      night: values.includes('night')
    }

    const meds = (this.data.meds || []).slice()
    meds[idx].times = values
    meds[idx].timesMap = timesMap
    this.setData({ meds })
  },

  onNextVisitChange(e) {
    this.setData({ nextVisitDate: e.detail.value })
  },

  // ----------- DB logic -----------

  loadSavedPlan() {
    const db = wx.cloud.database()
    db.collection('med_plan')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const doc = (res.data || [])[0]
        if (!doc) return

        const mapped = this._normalizePlan(doc)
        this.setData({
          savedPlan: mapped,
          meds: (mapped.meds && mapped.meds.length) ? mapped.meds.map(m => this._normalizeMed(m)) : [this._emptyMed()],
          nextVisitDate: mapped.nextVisitDate || ''
        })
      })
      .catch(err => {
        console.error('loadSavedPlan error:', err)
      })
  },

  savePlan() {
    const meds = (this.data.meds || []).map(m => this._normalizeMed(m))

    // 基本校验：至少一条有效药物（有名称）
    const validMeds = meds.filter(m => m.name)
    if (validMeds.length === 0) {
      wx.showToast({ title: '请至少选择一种药物', icon: 'none' })
      return
    }

    // 建议校验：剂量为空也允许（有些人只想先记药名），但可以提示
    const hasEmptyDose = validMeds.some(m => !String(m.doseMg || '').trim())
    if (hasEmptyDose) {
      wx.showToast({ title: '有药物未填写剂量（可继续保存）', icon: 'none' })
    }

    wx.showLoading({ title: '保存中...' })

    const db = wx.cloud.database()
    const now = new Date()
    const timeText = now.toLocaleString()

    const data = {
      meds: validMeds.map(m => ({
        name: m.name,
        doseMg: String(m.doseMg || '').trim(),
        times: m.times || []
      })),
      nextVisitDate: this.data.nextVisitDate || '',
      updatedAt: now,
      updatedTimeText: timeText
    }

    // 方案：每个用户只保留 1 份最新方案（取最新一条更新，没有则新增）
    db.collection('med_plan')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const doc = (res.data || [])[0]
        if (doc && doc._id) {
          return db.collection('med_plan').doc(doc._id).update({ data })
        }
        data.createdAt = now
        data.timeText = timeText
        return db.collection('med_plan').add({ data })
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.loadSavedPlan()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('savePlan error:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
  },

  // ----------- helpers -----------

  _emptyMed() {
    return {
      name: '',
      doseMg: '',
      times: [],
      timesMap: { morning: false, noon: false, night: false },
      timesText: '未填写'
    }
  },

  _normalizeMed(m) {
    const times = Array.isArray(m.times) ? m.times : []
    const timesMap = {
      morning: times.includes('morning'),
      noon: times.includes('noon'),
      night: times.includes('night')
    }
    return {
      name: m.name || '',
      doseMg: m.doseMg || '',
      times,
      timesMap,
      timesText: this._timesToText(times)
    }
  },

  _normalizePlan(doc) {
    const meds = Array.isArray(doc.meds) ? doc.meds : []
    return {
      ...doc,
      meds: meds.map(m => ({
        ...m,
        timesText: this._timesToText(m.times || [])
      }))
    }
  },

  _timesToText(times) {
    const map = { morning: '早', noon: '中', night: '晚' }
    const arr = Array.isArray(times) ? times : []
    return arr.length ? arr.map(t => map[t] || t).join('、') : '未填写'
  }
})