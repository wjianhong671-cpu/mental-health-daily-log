Page({
  data: {
    // 药物候选（先示例，后续再补全）
    medOptions: [
      '喹硫平',
      '碳酸锂缓释片',
      '丙戊酸镁',
      '奥氮平',
      '拉莫三嗪',
      '舍曲林',
      '帕罗西汀',
      '氟伏沙明',
      '阿立哌唑',
      '劳拉西泮',
      '奥沙西泮',
      '左匹克隆',
      '曲唑酮',
      '阿戈美拉汀'
    ],

    // 表单：多药
    meds: [],

    // 复诊日期
    nextVisitDate: '',

    // 已保存的方案展示
    savedPlan: null,

    // 当前方案docId（用于更新）
    planDocId: ''
  },

  onLoad() {
    // 默认先放一条空药，避免页面空白
    this.setData({
      meds: [this._newEmptyMed()]
    })
    this.loadPlan()
  },

  _newEmptyMed() {
    return {
      name: '',
      nameIndex: -1,
      totalMgPerDay: '',
      times: [],
      timesMap: { morning: false, noon: false, night: false },
      remark: ''
    }
  },

  // 选择复诊日期
  onNextVisitChange(e) {
    this.setData({ nextVisitDate: e.detail.value })
  },

  // 添加药物
  addMed() {
    const meds = this.data.meds.slice()
    meds.push(this._newEmptyMed())
    this.setData({ meds })
  },

  // 删除药物
  removeMed(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const meds = this.data.meds.slice()
    meds.splice(idx, 1)

    // 至少保留一条
    if (meds.length === 0) meds.push(this._newEmptyMed())

    this.setData({ meds })
  },

  // 药名选择
  onMedNameChange(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const nameIndex = Number(e.detail.value)
    const name = this.data.medOptions[nameIndex]

    const meds = this.data.meds.slice()
    meds[idx] = {
      ...meds[idx],
      nameIndex,
      name
    }
    this.setData({ meds })
  },

  // 剂量输入
  onDoseInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const val = e.detail.value

    const meds = this.data.meds.slice()
    meds[idx] = {
      ...meds[idx],
      totalMgPerDay: val
    }
    this.setData({ meds })
  },

  // 时间多选
  onTimesChange(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const values = e.detail.value || []

    const map = {
      morning: values.includes('morning'),
      noon: values.includes('noon'),
      night: values.includes('night')
    }

    const meds = this.data.meds.slice()
    meds[idx] = {
      ...meds[idx],
      times: values,
      timesMap: map
    }
    this.setData({ meds })
  },

  // 备注输入
  onRemarkInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const val = e.detail.value

    const meds = this.data.meds.slice()
    meds[idx] = {
      ...meds[idx],
      remark: val
    }
    this.setData({ meds })
  },

  // 保存方案（一个用户只保留一份“当前方案”：有则更新，无则新增）
  savePlan() {
    // 基础校验：至少一条药
    const meds = (this.data.meds || []).map(m => ({
      name: (m.name || '').trim(),
      totalMgPerDay: m.totalMgPerDay === '' ? '' : Number(m.totalMgPerDay),
      times: m.times || [],
      remark: (m.remark || '').trim()
    }))

    // 去掉完全空的药条目
    const cleaned = meds.filter(m => m.name || m.totalMgPerDay || (m.times && m.times.length) || m.remark)

    if (cleaned.length === 0) {
      wx.showToast({ title: '请至少添加一种药', icon: 'none' })
      return
    }

    // 校验每条必须：药名、剂量、时间
    for (let i = 0; i < cleaned.length; i++) {
      const m = cleaned[i]
      if (!m.name) {
        wx.showToast({ title: `第${i + 1}个药未选择名称`, icon: 'none' })
        return
      }
      if (!m.totalMgPerDay || Number.isNaN(m.totalMgPerDay)) {
        wx.showToast({ title: `第${i + 1}个药剂量未填写`, icon: 'none' })
        return
      }
      if (!m.times || m.times.length === 0) {
        wx.showToast({ title: `第${i + 1}个药未选择时间`, icon: 'none' })
        return
      }
    }

    wx.showLoading({ title: '保存中...' })

    const db = wx.cloud.database()
    const now = new Date()
    const updatedTimeText = now.toLocaleString()

    // 组装要写入的 plan 文档
    const docData = {
      nextVisitDate: this.data.nextVisitDate || '',
      meds: cleaned,
      updatedAt: now,
      updatedTimeText
    }

    // upsert：优先用 planDocId；没有就查最新一条
    const planDocId = this.data.planDocId
    const doUpdate = (id) => {
      return db.collection('med_plan').doc(id).update({ data: docData })
    }
    const doAdd = () => {
      return db.collection('med_plan').add({
        data: {
          ...docData,
          createdAt: now
        }
      })
    }

    const finalize = () => {
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.loadPlan()
    }

    const onError = (err) => {
      wx.hideLoading()
      console.error('savePlan error:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }

    if (planDocId) {
      doUpdate(planDocId).then(finalize).catch(onError)
      return
    }

    // 没有 docId：查最新一条，有则更新，无则新增
    db.collection('med_plan')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (list.length > 0) {
          const id = list[0]._id
          this.setData({ planDocId: id })
          return doUpdate(id)
        }
        return doAdd()
      })
      .then(finalize)
      .catch(onError)
  },

  // 读取并展示当前方案
  loadPlan() {
    const db = wx.cloud.database()
    db.collection('med_plan')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const list = res.data || []
        if (list.length === 0) {
          this.setData({ savedPlan: null, planDocId: '' })
          return
        }

        const plan = list[0]
        const meds = (plan.meds || []).map(m => {
          const times = m.times || []
          const timesText = times
            .map(t => (t === 'morning' ? '早' : t === 'noon' ? '中' : '晚'))
            .join('、')

          return {
            ...m,
            timesText
          }
        })

        this.setData({
          savedPlan: {
            ...plan,
            meds
          },
          planDocId: plan._id,
          nextVisitDate: plan.nextVisitDate || ''
        })
      })
      .catch(err => {
        console.error('loadPlan error:', err)
        wx.showToast({ title: '读取方案失败', icon: 'none' })
      })
  }
})