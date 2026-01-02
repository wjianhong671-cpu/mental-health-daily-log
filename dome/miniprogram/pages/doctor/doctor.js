// miniprogram/pages/doctor/doctor.js
const doctorHelper = require('../../utils/doctor-helper.js')

Page({
  data: {
    // 空状态标识
    empty: false,
    loading: true,
    
    // 摘要数据
    summary: null,
    
    // 格式化文本摘要
    formattedText: '',
    
    // 原始记录（用于调试）
    records: [],
    
    // 统计范围天数
    rangeDays: 7
  },

  onLoad() {
    this.loadDoctorSummary()
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadDoctorSummary()
  },


  // ===== 加载医生端摘要 =====
  async loadDoctorSummary() {
    try {
      this.setData({ loading: true, empty: false })
      
      // 获取 openid
      const app = getApp()
      const openid = await app.ensureOpenid()
      
      // openid 为空时显示空状态，不抛错
      if (!openid) {
        console.warn('loadDoctorSummary: openid not ready')
        this.setData({
          empty: true,
          summary: null,
          formattedText: '',
          records: [],
          loading: false
        })
        return
      }
      
      const db = wx.cloud.database()
      const rangeDays = this.data.rangeDays
      
      // 计算起始时间戳（N 天前），使用 createdAt 时间戳过滤，不依赖 date 字段
      const startTs = Date.now() - (rangeDays - 1) * 86400000

      // 构建查询条件
      const whereCondition = {
        _openid: openid,
        createdAt: db.command.gte(startTs)
      }

      // 查询近 N 天记录
      db.collection('daily_records')
        .where(whereCondition)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get()
        .then(res => {
          const rawRecords = res.data || []
          
          // 使用工具函数获取有效记录
          const validRecords = doctorHelper.getValidRecords(rawRecords)
          
          if (validRecords.length === 0) {
            // 空数据兜底
            this.setData({
              empty: true,
              summary: null,
              formattedText: '',
              records: [],
              loading: false
            })
            return
          }

          // 构建摘要
          const summary = doctorHelper.buildDoctorSummary(validRecords, {
            rangeDays
          })
          
          // 生成格式化文本
          const formattedText = doctorHelper.formatDoctorText(summary)

          this.setData({
            empty: false,
            summary,
            formattedText,
            records: validRecords,
            loading: false
          })
        })
        .catch(err => {
          console.error('loadDoctorSummary error:', err)
          wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
          this.setData({
            empty: true,
            summary: null,
            formattedText: '',
            records: [],
            loading: false
          })
        })
    } catch (err) {
      console.error('loadDoctorSummary error:', err)
      wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
      this.setData({
        empty: true,
        summary: null,
        formattedText: '',
        records: [],
        loading: false
      })
    }
  },

  // ===== 切换统计范围 =====
  changeRange(e) {
    const rangeDays = Number(e.currentTarget.dataset.days) || 7
    this.setData({ rangeDays }, () => {
      this.loadDoctorSummary()
    })
  }
})

