// miniprogram/pages/plan/plan.js
const medList = require('../../utils/med-list.js')

Page({
  data: {
    activeMedIdx: -1,
    suggestions: [], // [{id,name,aliasText,category}]
    meds: [],
    nextVisitDate: '',
    savedPlan: null
  },

  onLoad() {
    this.setData({ meds: [this._emptyMed()] })
    this.loadSavedPlan()
  },

  // ---------------- UI ----------------

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

    // 如果删除的是正在编辑的项，顺便清空联想
    if (this.data.activeMedIdx === idx) {
      this.setData({ activeMedIdx: -1, suggestions: [] })
    }
  },

  _buildSuggestions(q) {
    const list = (medList.searchMeds ? medList.searchMeds(q || '') : []).slice(0, 20)
    return list.map(m => ({
      id: m.id,
      name: m.name,
      aliasText: (m.aliases || []).join(' / '),
      category: m.category || ''
    }))
  },

  onMedNameFocus(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const q = (this.data.meds[idx]?.name || '')
    this.setData({
      activeMedIdx: idx,
      suggestions: this._buildSuggestions(q)
    })
  },

  onMedNameInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const q = (e.detail.value || '').trim()

    // 用户手打 = 解除锁定（必须重新点选），并清掉 medId
    this.setData({
      [`meds[${idx}].name`]: q,
      [`meds[${idx}].medId`]: '',
      [`meds[${idx}].nameLocked`]: false,
      activeMedIdx: idx,
      suggestions: this._buildSuggestions(q)
    })

    console.log('[plan] input idx=', idx, 'q=', q, 'suggestions=', (this.data.suggestions || []).length)
  },

  onPickSuggestion(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const medid = e.currentTarget.dataset.medid
    const picked = (this.data.suggestions || []).find(x => x.id === medid)
    if (!picked) return

    // 点选 = 写入通用名 + medId + 锁定
    this.setData({
      [`meds[${idx}].name`]: picked.name,
      [`meds[${idx}].medId`]: picked.id,
      [`meds[${idx}].nameLocked`]: true,
      suggestions: [] // 点完收起列表
    })
  },

  onClearMedName(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({
      [`meds[${idx}].name`]: '',
      [`meds[${idx}].medId`]: '',
      [`meds[${idx}].nameLocked`]: false,
      activeMedIdx: idx,
      suggestions: this._buildSuggestions('')
    })
  },

  onMedNameBlur() {
    // 不在 blur 时清 suggestions（避免用户点不到）
  },

  onDoseInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const val = String(e.detail.value || '')

    const meds = (this.data.meds || []).slice()
    if (!meds[idx]) return

    if (val.trim() === '') {
      meds[idx].doseValue = ''
      this.setData({ meds })
      return
    }

    const numVal = parseFloat(val)
    if (isNaN(numVal) || numVal < 0) {
      meds[idx].doseValue = val // 允许继续输入
      this.setData({ meds })
      return
    }

    meds[idx].doseValue = numVal
    this.setData({ meds })
  },

  onDoseUnitChange(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const unit = e.currentTarget.dataset.unit

    const meds = (this.data.meds || []).slice()
    if (!meds[idx]) return

    const currentValue = meds[idx].doseValue
    const currentUnit = meds[idx].doseUnit || 'mg'

    // 有值才换算
    if (currentValue !== '' && currentValue !== null && currentValue !== undefined && !isNaN(currentValue)) {
      const v = Number(currentValue)
      if (currentUnit === 'mg' && unit === 'g') {
        meds[idx].doseValue = parseFloat((v / 1000).toFixed(2))
        meds[idx].doseUnit = 'g'
      } else if (currentUnit === 'g' && unit === 'mg') {
        meds[idx].doseValue = Math.round(v * 1000)
        meds[idx].doseUnit = 'mg'
      } else {
        meds[idx].doseUnit = unit
      }
    } else {
      meds[idx].doseUnit = unit
    }

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
    if (!meds[idx]) return
    meds[idx].times = values
    meds[idx].timesMap = timesMap
    meds[idx].timesText = this._timesToText(values)

    this.setData({ meds })
  },

  onNextVisitChange(e) {
    this.setData({ nextVisitDate: e.detail.value })
  },

  // ---------------- DB ----------------

  async loadSavedPlan() {
    try {
      const app = getApp()
      const openid = await app.ensureOpenid()
      if (!openid) return

      const db = wx.cloud.database()
      db.collection('med_plan')
        .where({ _openid: openid })
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
        .catch(err => console.error('loadSavedPlan error:', err))
    } catch (err) {
      console.error('loadSavedPlan error:', err)
    }
  },

  async savePlan() {
    try {
      wx.showLoading({ title: '保存中...' })

      const app = getApp()
      let openid = null
      try {
        openid = await app.ensureOpenid()
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '云服务未就绪，请重启后再试', icon: 'none' })
        return
      }
      if (!openid) {
        wx.hideLoading()
        wx.showToast({ title: '登录状态未就绪，请稍后再试', icon: 'none' })
        return
      }

      const meds = (this.data.meds || []).map(m => this._normalizeMed(m))
      const validMeds = meds.filter(m => m.name)

      if (validMeds.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '请至少选择一种药物', icon: 'none' })
        return
      }

      // 强校验：必须点选（nameLocked=true 且有 medId）
      const unconfirmed = validMeds.filter(m => !m.nameLocked || !m.medId)
      if (unconfirmed.length > 0) {
        wx.hideLoading()
        wx.showToast({ title: '请从下方候选中点选药物（不要只输入文字）', icon: 'none' })
        return
      }

      const db = wx.cloud.database()
      const now = Date.now()
      const timeText = new Date(now).toLocaleString()

      const data = {
        meds: validMeds.map(m => ({
          name: m.name,
          medId: m.medId || '',
          nameLocked: true,
          doseValue: (m.doseValue === '' || m.doseValue === null || m.doseValue === undefined) ? '' : Number(m.doseValue),
          doseUnit: m.doseUnit || 'mg',
          doseMgPerDay: this._toMgOrEmpty(m.doseValue, m.doseUnit),
          times: m.times || [],
          timesText: this._timesToText(m.times || [])
        })),
        nextVisitDate: this.data.nextVisitDate || '',
        updatedAt: now,
        updatedTimeText: timeText
      }

      db.collection('med_plan')
        .where({ _openid: openid })
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get()
        .then(res => {
          const doc = (res.data || [])[0]
          if (doc && doc._id) {
            return db.collection('med_plan')
              .where({ _id: doc._id, _openid: openid })
              .update({ data })
          }
          data.createdAt = now
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
    } catch (err) {
      wx.hideLoading()
      console.error('savePlan error:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // ---------------- helpers ----------------

  _toMgOrEmpty(value, unit) {
    if (value === '' || value === null || value === undefined) return ''
    const v = Number(value)
    if (isNaN(v)) return ''
    return unit === 'g' ? Math.round(v * 1000) : Math.round(v)
  },

  _emptyMed() {
    return {
      name: '',
      medId: '',
      nameLocked: false,
      doseValue: '',
      doseUnit: 'mg',
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

    let doseValue = m.doseValue
    let doseUnit = m.doseUnit || 'mg'

    // 兼容旧字段 doseMgPerDay / doseMg
    if (m.doseMgPerDay !== undefined && m.doseMgPerDay !== null && m.doseMgPerDay !== '') {
      const mgValue = Number(m.doseMgPerDay)
      if (!isNaN(mgValue) && mgValue > 0) {
        if (mgValue >= 1000) { doseValue = parseFloat((mgValue / 1000).toFixed(2)); doseUnit = 'g' }
        else { doseValue = mgValue; doseUnit = 'mg' }
      }
    } else if (m.doseMg !== undefined && m.doseMg !== null && m.doseMg !== '') {
      const mgValue = Number(m.doseMg)
      if (!isNaN(mgValue) && mgValue > 0) {
        if (mgValue >= 1000) { doseValue = parseFloat((mgValue / 1000).toFixed(2)); doseUnit = 'g' }
        else { doseValue = mgValue; doseUnit = 'mg' }
      }
    }

    return {
      name: m.name || '',
      medId: m.medId || '',
      nameLocked: m.nameLocked === true, // 老数据没有也没关系
      doseValue: (doseValue === 0 ? 0 : (doseValue || '')),
      doseUnit,
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