Page({
  data: {
    riskSummary: {
      suicidal: { level: "orange", text: "出现闪念", lastDate: "12/29", count: 2 },
      impulse: { level: "green", text: "近7天无", lastDate: "-", count: 0 },
      mania: { level: "red", text: "睡眠下降且精力上升", lastDate: "12/28", count: 3 }
    },
    sleepSummary: {
      avgHours: 6.5,
      validDays: 6,
      qualityCounts: { 1: 0, 2: 1, 3: 2, 4: 2, 5: 1 },
      issuesDays: { insomnia: 2, early_wake: 1, dreams: 3, daytime_sleepy: 2 }
    },
    moodSummary: {
      avgMood: 5.8,
      minMood: 3,
      maxMood: 8,
      variabilityText: "波动明显",
      activationDays: 2
    },
    medStability: {
      validDays: 6,
      missDays: 2,
      extraDays: 1,
      summaryText: "近7天用药总体稳定，偶有漏服"
    },
    adverseSummary: {
      topEffectsText: "嗜睡、焦虑、头晕",
      effectDays: 4,
      maxSeverity: 2,
      maxSeverityText: "中度",
      lastDate: "12/28"
    }
  },

  onLoad() {
    this.loadRiskSummary()
  },

  loadRiskSummary() {
    const db = wx.cloud.database()
    db.collection('daily_records')
      .orderBy('date', 'desc')
      .limit(7)
      .get()
      .then(res => {
        const records = res.data || []
        
        // 计算自伤/自杀风险
        const suicidalRecords = records.filter(r => r.riskSuicidal >= 1)
        let suicidalLevel = 'green'
        let suicidalText = '近7天无'
        let suicidalCount = suicidalRecords.length
        let suicidalLastDate = '-'
        
        if (records.length === 0) {
          suicidalLevel = 'gray'
          suicidalText = '数据不足'
        } else {
          const hasLevel2 = suicidalRecords.some(r => r.riskSuicidal === 2)
          const hasLevel1 = suicidalRecords.some(r => r.riskSuicidal === 1)
          
          if (hasLevel2) {
            suicidalLevel = 'red'
            suicidalText = '出现明确风险'
          } else if (hasLevel1) {
            suicidalLevel = 'orange'
            suicidalText = '出现闪念'
          }
          
          if (suicidalRecords.length > 0) {
            const lastRecord = suicidalRecords[0]
            if (lastRecord.date) {
              const dateParts = lastRecord.date.split('-')
              if (dateParts.length === 3) {
                suicidalLastDate = `${dateParts[1]}/${dateParts[2]}`
              }
            }
          }
        }

        // 计算冲动失控风险
        const impulseRecords = records.filter(r => r.riskImpulse === 1)
        let impulseLevel = 'green'
        let impulseText = '近7天无'
        let impulseCount = impulseRecords.length
        let impulseLastDate = '-'
        
        if (records.length === 0) {
          impulseLevel = 'gray'
          impulseText = '数据不足'
        } else if (impulseRecords.length > 0) {
          impulseLevel = 'orange'
          impulseText = '冲动增加'
          const lastRecord = impulseRecords[0]
          if (lastRecord.date) {
            const dateParts = lastRecord.date.split('-')
            if (dateParts.length === 3) {
              impulseLastDate = `${dateParts[1]}/${dateParts[2]}`
            }
          }
        }

        // 计算躁转风险
        const maniaRecords = records.filter(r => r.sleepReduced === true && r.energyIncreased === true)
        let maniaLevel = 'green'
        let maniaText = '近7天无'
        let maniaCount = maniaRecords.length
        let maniaLastDate = '-'
        
        if (records.length === 0) {
          maniaLevel = 'gray'
          maniaText = '数据不足'
        } else if (maniaRecords.length >= 2) {
          maniaLevel = 'red'
          maniaText = '多天触发信号'
        } else if (maniaRecords.length === 1) {
          maniaLevel = 'orange'
          maniaText = '触发信号'
        }
        
        if (maniaRecords.length > 0) {
          const lastRecord = maniaRecords[0]
          if (lastRecord.date) {
            const dateParts = lastRecord.date.split('-')
            if (dateParts.length === 3) {
              maniaLastDate = `${dateParts[1]}/${dateParts[2]}`
            }
          }
        }

        // 计算睡眠结构摘要
        const validDays = records.filter(r => 
          (typeof r.sleepDurationHour === 'number' && r.sleepDurationHour !== null) || 
          (typeof r.sleepQuality === 'number' && r.sleepQuality !== null)
        ).length

        const sleepDurationRecords = records.filter(r => typeof r.sleepDurationHour === 'number' && r.sleepDurationHour !== null)
        let avgHours = null
        if (sleepDurationRecords.length > 0) {
          const sum = sleepDurationRecords.reduce((acc, r) => acc + r.sleepDurationHour, 0)
          avgHours = Math.round((sum / sleepDurationRecords.length) * 10) / 10
        }

        const qualityCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        records.forEach(r => {
          if (typeof r.sleepQuality === 'number' && r.sleepQuality >= 1 && r.sleepQuality <= 5) {
            qualityCounts[r.sleepQuality] = (qualityCounts[r.sleepQuality] || 0) + 1
          }
        })

        const issuesDays = { insomnia: 0, early_wake: 0, dreams: 0, daytime_sleepy: 0 }
        records.forEach(r => {
          if (Array.isArray(r.sleepIssues)) {
            if (r.sleepIssues.includes('insomnia')) issuesDays.insomnia++
            if (r.sleepIssues.includes('early_wake')) issuesDays.early_wake++
            if (r.sleepIssues.includes('dreams')) issuesDays.dreams++
            if (r.sleepIssues.includes('daytime_sleepy')) issuesDays.daytime_sleepy++
          }
        })

        // 计算情绪与激活趋势
        const validMoodRecords = records.filter(r => typeof r.mood === 'number')
        let avgMood = null
        let minMood = null
        let maxMood = null
        let variabilityText = "数据不足"
        
        if (validMoodRecords.length > 0) {
          const moods = validMoodRecords.map(r => r.mood)
          const sum = moods.reduce((acc, m) => acc + m, 0)
          avgMood = Math.round((sum / moods.length) * 10) / 10
          minMood = Math.min(...moods)
          maxMood = Math.max(...moods)
          
          if (validMoodRecords.length >= 3) {
            if (maxMood - minMood >= 4) {
              variabilityText = "波动明显"
            } else {
              variabilityText = "相对稳定"
            }
          }
        }

        const activationDays = records.filter(r => r.energyIncreased === true).length

        // 计算用药稳定性
        const medValidDays = records.filter(r => r.takeMedMap && typeof r.takeMedMap === 'object').length
        
        const extraDays = records.filter(r => {
          if (typeof r.takeMedText === 'string') {
            return r.takeMedText.includes('额外记录')
          }
          return false
        }).length

        let missDays = 0
        records.forEach(r => {
          if (r.planSnapshot && Array.isArray(r.planSnapshot.meds) && r.takeMedMap && typeof r.takeMedMap === 'object') {
            const requiredTimes = new Set()
            r.planSnapshot.meds.forEach(med => {
              if (Array.isArray(med.times)) {
                med.times.forEach(time => {
                  if (time === 'morning' || time === 'noon' || time === 'night') {
                    requiredTimes.add(time)
                  }
                })
              }
            })
            
            if (requiredTimes.size > 0) {
              let hasMiss = false
              requiredTimes.forEach(time => {
                if (r.takeMedMap[time] !== true) {
                  hasMiss = true
                }
              })
              if (hasMiss) {
                missDays++
              }
            }
          }
        })

        let summaryText = ''
        if (medValidDays < 3) {
          summaryText = `数据不足：仅记录 ${medValidDays}/7。 `
        }
        
        if (missDays === 0 && extraDays === 0) {
          summaryText += '近7天用药稳定'
        } else if (missDays > 0 && extraDays === 0) {
          summaryText += `近7天存在漏服/未按方案 ${missDays} 天`
        } else if (missDays === 0 && extraDays > 0) {
          summaryText += `近7天存在额外用药记录 ${extraDays} 天`
        } else if (missDays > 0 && extraDays > 0) {
          summaryText += `近7天漏服/未按方案 ${missDays} 天，额外记录 ${extraDays} 天`
        }

        // 计算不良体验摘要
        const sideEffectNameMap = {
          sleepy: '嗜睡/发困',
          dizzy: '头晕',
          nausea: '恶心/胃不适',
          anxiety: '焦虑/坐立不安',
          tremor: '震颤',
          palpitation: '心悸',
          rash: '皮疹',
          appetite: '食欲变化',
          constipation: '便秘',
          other: '其他',
          none: '没有'
        }

        const effectDaysRecords = records.filter(r => {
          if (!Array.isArray(r.sideEffects)) return false
          if (r.sideEffects.length === 0) return false
          if (r.sideEffects.includes('none')) return false
          return true
        })
        const effectDays = effectDaysRecords.length

        // 统计每个副作用出现的天数
        const effectCountMap = {}
        records.forEach(r => {
          if (Array.isArray(r.sideEffects) && r.sideEffects.length > 0 && !r.sideEffects.includes('none')) {
            const uniqueEffects = [...new Set(r.sideEffects)]
            uniqueEffects.forEach(effect => {
              if (effect !== 'none') {
                effectCountMap[effect] = (effectCountMap[effect] || 0) + 1
              }
            })
          }
        })

        // 取 Top3
        const sortedEffects = Object.entries(effectCountMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)

        let topEffectsText = ''
        if (sortedEffects.length === 0) {
          topEffectsText = '近7天无明显不适'
        } else {
          topEffectsText = sortedEffects.map(([key, days]) => {
            const name = sideEffectNameMap[key] || key
            return `${name}(${days})`
          }).join('、')
        }

        // 计算 maxSeverity
        let maxSeverity = null
        let maxSeverityText = '未选择'
        const severityRecords = records.filter(r => {
          if (!Array.isArray(r.sideEffects)) return false
          if (r.sideEffects.length === 0) return false
          if (r.sideEffects.includes('none')) return false
          return typeof r.sideEffectSeverity === 'number'
        })
        
        if (severityRecords.length > 0) {
          maxSeverity = Math.max(...severityRecords.map(r => r.sideEffectSeverity))
          const severityMap = { 0: '不明显', 1: '轻度', 2: '中度', 3: '重度' }
          maxSeverityText = severityMap[maxSeverity] || '未选择'
        }

        // 计算 lastDate
        let lastDate = '-'
        if (effectDaysRecords.length > 0) {
          const lastRecord = effectDaysRecords[0]
          if (lastRecord.date) {
            const dateParts = lastRecord.date.split('-')
            if (dateParts.length === 3) {
              lastDate = `${dateParts[1]}/${dateParts[2]}`
            }
          }
        }

        this.setData({
          riskSummary: {
            suicidal: {
              level: suicidalLevel,
              text: suicidalText,
              lastDate: suicidalLastDate,
              count: suicidalCount
            },
            impulse: {
              level: impulseLevel,
              text: impulseText,
              lastDate: impulseLastDate,
              count: impulseCount
            },
            mania: {
              level: maniaLevel,
              text: maniaText,
              lastDate: maniaLastDate,
              count: maniaCount
            }
          },
          sleepSummary: {
            avgHours: avgHours,
            validDays: validDays,
            qualityCounts: qualityCounts,
            issuesDays: issuesDays
          },
          moodSummary: {
            avgMood: avgMood,
            minMood: minMood,
            maxMood: maxMood,
            variabilityText: variabilityText,
            activationDays: activationDays
          },
          medStability: {
            validDays: medValidDays,
            missDays: missDays,
            extraDays: extraDays,
            summaryText: summaryText
          },
          adverseSummary: {
            topEffectsText: topEffectsText,
            effectDays: effectDays,
            maxSeverity: maxSeverity,
            maxSeverityText: maxSeverityText,
            lastDate: lastDate
          }
        })
      })
      .catch(err => {
        console.error('loadRiskSummary error:', err)
      })
  },

  goVisitPrep() {
    wx.navigateTo({ url: '/pages/visit_prep/visit_prep' })
  },

  goSummary() {
    const rs = this.data.riskSummary
    const ss = this.data.sleepSummary
    const ms = this.data.moodSummary
    const meds = this.data.medStability
    const ads = this.data.adverseSummary

    // 先读取 visit_prep
    const db = wx.cloud.database()
    db.collection('visit_prep')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
      .then(res => {
        const prepDoc = (res.data || [])[0]
        
        let prepSection = ''
        if (prepDoc) {
          const goalMap = {
            side_effect: '副作用较明显，想讨论是否调整',
            improve: '症状有好转，想讨论是否维持/减量',
            relapse: '症状反复，想重新评估方案',
            other: '其他',
            // 兼容旧值
            adjust_side_effect: '副作用较明显，想讨论是否调整',
            maintain_reduce: '症状有好转，想讨论是否维持/减量',
            reevaluate: '症状反复，想重新评估方案'
          }
          const goalTexts = Array.isArray(prepDoc.goals) 
            ? prepDoc.goals.map(g => goalMap[g] || g).filter(Boolean)
            : []
          
          const concern2Line = (prepDoc.concern2 || '').trim() ? `  2. ${prepDoc.concern2}` : ''
          const goalOtherLine = (prepDoc.goals || []).includes('other') && (prepDoc.goalOther || '').trim() 
            ? `\n  其他：${prepDoc.goalOther}` 
            : ''
          
          prepSection = `【本次复诊重点】
- 最困扰的问题：
  1. ${prepDoc.concern1 || '未填写'}${concern2Line ? '\n' + concern2Line : ''}
- 本次复诊主要目的：
  · ${goalTexts.length > 0 ? goalTexts.join('\n  · ') : '未填写'}${goalOtherLine}

—— 以下为近7天客观记录摘要 ——

`
        } else {
          prepSection = `【本次复诊重点】（未填写）

—— 以下为近7天客观记录摘要 ——

`
        }

        // 风险信号 level 转中文
        const levelMap = { red: '高风险', orange: '中风险', green: '低风险', gray: '数据不足' }
        const suicidalLevelText = levelMap[rs.suicidal.level] || '未知'
        const impulseLevelText = levelMap[rs.impulse.level] || '未知'
        const maniaLevelText = levelMap[rs.mania.level] || '未知'

        // 风险信号日期格式化
        const formatRiskDate = (lastDate, count) => {
          if (!lastDate || lastDate === '-') {
            return `近7天未出现，${count}/7`
          }
          return `最近 ${lastDate}，${count}/7`
        }

        // 睡眠质量分布文本
        const qualityText = `优${ss.qualityCounts[5]} 良${ss.qualityCounts[4]} 一般${ss.qualityCounts[3]} 差${ss.qualityCounts[2]} 很差${ss.qualityCounts[1]}`

        // 用药结论文案优化
        let medConclusion = meds.summaryText || ''
        if (medConclusion.includes('数据不足：仅记录')) {
          const match = medConclusion.match(/数据不足：仅记录 (\d+)\/7/)
          if (match) {
            const days = match[1]
            medConclusion = medConclusion.replace(/数据不足：仅记录 \d+\/7。 /, `近7天记录较少（${days}/7），`)
            medConclusion = medConclusion.replace(/近7天存在漏服\/未按方案 (\d+) 天/, '其中有 $1 天存在漏服或未按方案用药')
            medConclusion = medConclusion.replace(/近7天存在额外用药记录 (\d+) 天/, '其中有 $1 天存在额外用药记录')
            medConclusion = medConclusion.replace(/近7天漏服\/未按方案 (\d+) 天，额外记录 (\d+) 天/, '其中有 $1 天存在漏服或未按方案用药，$2 天存在额外用药记录')
          }
        } else {
          medConclusion = medConclusion.replace(/近7天存在漏服\/未按方案 (\d+) 天/, '近7天存在漏服或未按方案用药 $1 天')
        }

        const summaryText = prepSection + `复诊摘要（近7天）
基于患者自填记录

一、风险信号
- 自伤/自杀：${suicidalLevelText}（${formatRiskDate(rs.suicidal.lastDate, rs.suicidal.count)}）
- 冲动失控：${impulseLevelText}（${formatRiskDate(rs.impulse.lastDate, rs.impulse.count)}）
- 躁转风险：${maniaLevelText}（${formatRiskDate(rs.mania.lastDate, rs.mania.count)}）

二、睡眠
- 平均睡眠：${ss.avgHours || '-'} 小时（近7天仅 ${ss.validDays} 天有记录）
- 睡眠质量分布：${qualityText}
- 睡眠问题天数：入睡困难${ss.issuesDays.insomnia}，早醒${ss.issuesDays.early_wake}，多梦/噩梦${ss.issuesDays.dreams}，白天嗜睡${ss.issuesDays.daytime_sleepy}

三、情绪与激活
- 自评情绪（1-10分，分数越高表示状态越好）：平均 ${ms.avgMood || '-'}；范围 ${ms.minMood || '-'}–${ms.maxMood || '-'}；波动：${ms.variabilityText}
- 激活信号
  （如精力明显增加、睡眠减少仍不困、停不下来等）
  近7天出现：${ms.activationDays} 天
注：以上为患者自评记录，仅供门诊沟通参考。

四、用药
- 记录完整度：${meds.validDays}/7
- 漏服/未按方案：${meds.missDays} 天；额外记录：${meds.extraDays} 天
- 结论：${medConclusion}

五、不良体验
- Top：${ads.topEffectsText}
- 最高严重度：${ads.maxSeverityText}；最近一次：${ads.lastDate}
- 提示：不良体验以"${ads.topEffectsText}"等为主（供门诊沟通参考）`

        wx.navigateTo({ 
          url: '/pages/summary/summary?text=' + encodeURIComponent(summaryText) 
        })
      })
      .catch(err => {
        console.error('load visit_prep error:', err)
        // 即使失败也继续生成摘要
        const levelMap = { red: '高风险', orange: '中风险', green: '低风险', gray: '数据不足' }
        const suicidalLevelText = levelMap[rs.suicidal.level] || '未知'
        const impulseLevelText = levelMap[rs.impulse.level] || '未知'
        const maniaLevelText = levelMap[rs.mania.level] || '未知'
        
        // 风险信号日期格式化
        const formatRiskDate = (lastDate, count) => {
          if (!lastDate || lastDate === '-') {
            return `近7天未出现，${count}/7`
          }
          return `最近 ${lastDate}，${count}/7`
        }
        
        const qualityText = `优${ss.qualityCounts[5]} 良${ss.qualityCounts[4]} 一般${ss.qualityCounts[3]} 差${ss.qualityCounts[2]} 很差${ss.qualityCounts[1]}`
        
        // 用药结论文案优化
        let medConclusion = meds.summaryText || ''
        if (medConclusion.includes('数据不足：仅记录')) {
          const match = medConclusion.match(/数据不足：仅记录 (\d+)\/7/)
          if (match) {
            const days = match[1]
            medConclusion = medConclusion.replace(/数据不足：仅记录 \d+\/7。 /, `近7天记录较少（${days}/7），`)
            medConclusion = medConclusion.replace(/近7天存在漏服\/未按方案 (\d+) 天/, '其中有 $1 天存在漏服或未按方案用药')
            medConclusion = medConclusion.replace(/近7天存在额外用药记录 (\d+) 天/, '其中有 $1 天存在额外用药记录')
            medConclusion = medConclusion.replace(/近7天漏服\/未按方案 (\d+) 天，额外记录 (\d+) 天/, '其中有 $1 天存在漏服或未按方案用药，$2 天存在额外用药记录')
          }
        } else {
          medConclusion = medConclusion.replace(/近7天存在漏服\/未按方案 (\d+) 天/, '近7天存在漏服或未按方案用药 $1 天')
        }
        
        const summaryText = `【本次复诊重点】（未填写）

—— 以下为近7天客观记录摘要 ——

复诊摘要（近7天）
基于患者自填记录

一、风险信号
- 自伤/自杀：${suicidalLevelText}（${formatRiskDate(rs.suicidal.lastDate, rs.suicidal.count)}）
- 冲动失控：${impulseLevelText}（${formatRiskDate(rs.impulse.lastDate, rs.impulse.count)}）
- 躁转风险：${maniaLevelText}（${formatRiskDate(rs.mania.lastDate, rs.mania.count)}）

二、睡眠
- 平均睡眠：${ss.avgHours || '-'} 小时（近7天仅 ${ss.validDays} 天有记录）
- 睡眠质量分布：${qualityText}
- 睡眠问题天数：入睡困难${ss.issuesDays.insomnia}，早醒${ss.issuesDays.early_wake}，多梦/噩梦${ss.issuesDays.dreams}，白天嗜睡${ss.issuesDays.daytime_sleepy}

三、情绪与激活
- 自评情绪（1-10分，分数越高表示状态越好）：平均 ${ms.avgMood || '-'}；范围 ${ms.minMood || '-'}–${ms.maxMood || '-'}；波动：${ms.variabilityText}
- 激活信号
  （如精力明显增加、睡眠减少仍不困、停不下来等）
  近7天出现：${ms.activationDays} 天
注：以上为患者自评记录，仅供门诊沟通参考。

四、用药
- 记录完整度：${meds.validDays}/7
- 漏服/未按方案：${meds.missDays} 天；额外记录：${meds.extraDays} 天
- 结论：${medConclusion}

五、不良体验
- Top：${ads.topEffectsText}
- 最高严重度：${ads.maxSeverityText}；最近一次：${ads.lastDate}
- 提示：不良体验以"${ads.topEffectsText}"等为主（供门诊沟通参考）`
        wx.navigateTo({ 
          url: '/pages/summary/summary?text=' + encodeURIComponent(summaryText) 
        })
      })
  }
})

