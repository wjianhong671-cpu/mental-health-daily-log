// miniprogram/utils/doctor-helper.js
// 医生端数据统计与格式化工具（纯函数，无副作用）

/**
 * 安全数字转换，永不返回 NaN
 * @param {any} v - 输入值
 * @param {number} fallback - 默认值，默认 0
 * @returns {number}
 */
function safeNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback
  const num = Number(v)
  return isNaN(num) ? fallback : num
}

/**
 * 安全平均值计算，无数据时返回 null
 * @param {number[]} nums - 数字数组
 * @param {number|null} fallback - 默认值，默认 null
 * @returns {number|null}
 */
function safeAvg(nums, fallback = null) {
  if (!Array.isArray(nums) || nums.length === 0) return fallback
  const validNums = nums.filter(n => typeof n === 'number' && !isNaN(n))
  if (validNums.length === 0) return fallback
  const sum = validNums.reduce((a, b) => a + b, 0)
  return Number((sum / validNums.length).toFixed(1))
}

/**
 * 标准化单条记录，统一字段名和格式
 * @param {object} raw - 原始记录
 * @returns {object} 标准化后的记录
 */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null

  // 兼容多种字段名：moodScore / mood / mood_score
  const moodScore = safeNumber(
    raw.moodScore || raw.mood || raw.mood_score,
    null
  )
  // 限制范围 1-10，超出则置 null
  const normalizedMood = (moodScore >= 1 && moodScore <= 10) ? moodScore : null

  // 兼容多种时间字段：createdAt / createTime / date
  let createdAt = null
  if (raw.createdAt) {
    if (typeof raw.createdAt === 'number') {
      createdAt = raw.createdAt
    } else if (raw.createdAt instanceof Date) {
      createdAt = raw.createdAt.getTime()
    } else if (raw.createdAt.$date) {
      createdAt = new Date(raw.createdAt.$date).getTime()
    }
  } else if (raw.createTime) {
    createdAt = typeof raw.createTime === 'number' ? raw.createTime : null
  }

  // 从 date 字符串推导 createdAt（如果缺失）
  let dateStr = raw.date || raw.dateStr || ''
  if (!createdAt && dateStr) {
    try {
      const date = new Date(dateStr + 'T00:00:00')
      if (!isNaN(date.getTime())) {
        createdAt = date.getTime()
        if (!dateStr.includes('-')) {
          dateStr = date.toISOString().slice(0, 10)
        }
      }
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 从 createdAt 推导 dateStr（如果缺失）
  if (!dateStr && createdAt) {
    try {
      dateStr = new Date(createdAt).toISOString().slice(0, 10)
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 副作用数组
  const sideEffects = Array.isArray(raw.sideEffects) ? raw.sideEffects : []

  // 用药数组（从 planSnapshot 或 meds 字段提取）
  let meds = []
  if (raw.planSnapshot && Array.isArray(raw.planSnapshot.meds)) {
    meds = raw.planSnapshot.meds
  } else if (Array.isArray(raw.meds)) {
    meds = raw.meds
  }

  return {
    _id: raw._id || null,
    moodScore: normalizedMood,
    createdAt,
    dateStr,
    sleepDurationHour: typeof raw.sleepDurationHour === 'number' ? raw.sleepDurationHour : null,
    sleepQuality: typeof raw.sleepQuality === 'number' ? raw.sleepQuality : null,
    sleepIssues: Array.isArray(raw.sleepIssues) ? raw.sleepIssues : [],
    sideEffects,
    sideEffectSeverity: typeof raw.sideEffectSeverity === 'number' ? raw.sideEffectSeverity : null,
    sideEffectNote: typeof raw.sideEffectNote === 'string' ? raw.sideEffectNote : '',
    meds,
    takeMedMap: raw.takeMedMap || {},
    riskSuicidal: safeNumber(raw.riskSuicidal, 0),
    riskImpulse: safeNumber(raw.riskImpulse, 0),
    sleepReduced: raw.sleepReduced === true,
    energyIncreased: raw.energyIncreased === true,
    // 保留原始数据用于调试
    _raw: raw
  }
}

/**
 * 获取有效记录列表，过滤无效数据
 * @param {any} records - 输入记录（可能为 null/undefined/非数组）
 * @param {object} opts - 选项
 * @param {boolean} opts.strict - 是否严格模式（默认 false，宽松模式允许部分字段缺失）
 * @returns {object[]} 有效记录数组
 */
function getValidRecords(records, opts = {}) {
  if (!records) return []
  if (!Array.isArray(records)) return []

  const { strict = false } = opts
  const valid = []

  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue

    const normalized = normalizeRecord(raw)

    if (!normalized) continue

    // 严格模式：至少需要 moodScore 或 createdAt
    if (strict && !normalized.moodScore && !normalized.createdAt) {
      continue
    }

    valid.push(normalized)
  }

  return valid
}

/**
 * 计算情绪评分统计
 * @param {object[]} records - 标准化后的记录数组
 * @returns {object} { avg, min, max, count }
 */
function calcMoodStats(records) {
  const moodScores = records
    .map(r => r.moodScore)
    .filter(score => score !== null && typeof score === 'number')

  if (moodScores.length === 0) {
    return {
      avg: null,
      min: null,
      max: null,
      count: 0
    }
  }

  const sum = moodScores.reduce((a, b) => a + b, 0)
  const avg = Number((sum / moodScores.length).toFixed(1))
  const min = Math.min(...moodScores)
  const max = Math.max(...moodScores)

  return {
    avg,
    min,
    max,
    count: moodScores.length
  }
}

/**
 * 计算睡眠统计
 * @param {object[]} records - 标准化后的记录数组
 * @returns {object|null} { avgHours, minHours, maxHours, count } 或 null
 */
function calcSleepStats(records) {
  const hours = records
    .map(r => r.sleepDurationHour)
    .filter(h => h !== null && typeof h === 'number')

  if (hours.length === 0) {
    return null
  }

  const avgHours = safeAvg(hours, null)
  const minHours = Math.min(...hours)
  const maxHours = Math.max(...hours)

  return {
    avgHours,
    minHours,
    maxHours,
    count: hours.length
  }
}

/**
 * 计算用药执行/变更概览（只记录事实，不做医学建议）
 * @param {object[]} records - 标准化后的记录数组
 * @returns {object|null} { changed, names, complianceRate } 或 null
 */
function calcMedicationStats(records) {
  if (!records || records.length === 0) return null

  // 收集所有用药名称
  const allMedNames = new Set()
  let hasMedData = false

  records.forEach(r => {
    if (r.meds && r.meds.length > 0) {
      hasMedData = true
      r.meds.forEach(med => {
        if (med.name) {
          allMedNames.add(med.name)
        }
      })
    }
  })

  if (!hasMedData) return null

  // 检查是否有用药变更（简单判断：不同记录的用药名称集合是否一致）
  let changed = false
  if (records.length > 1) {
    const firstMeds = new Set(
      (records[0].meds || [])
        .map(m => m.name)
        .filter(Boolean)
    )
    for (let i = 1; i < records.length; i++) {
      const currentMeds = new Set(
        (records[i].meds || [])
          .map(m => m.name)
          .filter(Boolean)
      )
      // 比较两个集合是否相同
      if (firstMeds.size !== currentMeds.size ||
          [...firstMeds].some(name => !currentMeds.has(name))) {
        changed = true
        break
      }
    }
  }

  // 计算依从性（简单版本：有 takeMedMap 的记录占比）
  let complianceCount = 0
  records.forEach(r => {
    if (r.takeMedMap && typeof r.takeMedMap === 'object') {
      const hasTaken = Object.values(r.takeMedMap).some(v => v === true)
      if (hasTaken) complianceCount++
    }
  })
  const complianceRate = records.length > 0
    ? Number((complianceCount / records.length * 100).toFixed(1))
    : null

  return {
    changed,
    names: Array.from(allMedNames),
    complianceRate
  }
}

/**
 * 构建医生端结构化摘要对象
 * @param {object[]} records - 标准化后的记录数组
 * @param {object} options - 选项
 * @param {number} options.rangeDays - 统计范围天数，默认 7
 * @returns {object} 摘要对象
 */
function buildDoctorSummary(records, options = {}) {
  const { rangeDays = 7 } = options
  const validRecords = getValidRecords(records)

  const moodStats = calcMoodStats(validRecords)
  const sleepStats = calcSleepStats(validRecords)
  const medStats = calcMedicationStats(validRecords)

  // 收集副作用（去重，按出现频次排序）
  const sideEffectCounts = {}
  validRecords.forEach(r => {
    if (Array.isArray(r.sideEffects)) {
      r.sideEffects.forEach(effect => {
        if (effect && effect !== 'none') {
          sideEffectCounts[effect] = (sideEffectCounts[effect] || 0) + 1
        }
      })
    }
  })
  const sideEffectsTop = Object.entries(sideEffectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name)

  // 收集有备注的记录
  const notes = validRecords
    .filter(r => r.sideEffectNote && r.sideEffectNote.trim())
    .map(r => ({
      date: r.dateStr || '',
      note: r.sideEffectNote.trim()
    }))

  // 风险标记
  const hasRisk = validRecords.some(r => 
    r.riskSuicidal > 0 || r.riskImpulse > 0
  )

  return {
    rangeDays,
    count: validRecords.length,
    mood: moodStats,
    sleep: sleepStats,
    meds: medStats,
    sideEffectsTop,
    notes,
    hasRisk
  }
}

/**
 * 格式化医生端摘要为可展示的文本片段（不含产品名）
 * @param {object} summary - buildDoctorSummary 返回的摘要对象
 * @returns {string} 格式化文本
 */
function formatDoctorText(summary) {
  if (!summary || summary.count === 0) {
    return '暂无记录数据'
  }

  const parts = []

  // 情绪统计
  if (summary.mood && summary.mood.count > 0) {
    parts.push(`情绪评分：平均 ${summary.mood.avg}（范围 ${summary.mood.min}-${summary.mood.max}，共 ${summary.mood.count} 条记录）`)
  }

  // 睡眠统计
  if (summary.sleep) {
    parts.push(`睡眠时长：平均 ${summary.sleep.avgHours} 小时（范围 ${summary.sleep.minHours}-${summary.sleep.maxHours} 小时）`)
  }

  // 用药统计
  if (summary.meds) {
    if (summary.meds.names.length > 0) {
      parts.push(`用药：${summary.meds.names.join('、')}`)
      if (summary.meds.changed) {
        parts.push('（期间有用药变更）')
      }
    }
    if (summary.meds.complianceRate !== null) {
      parts.push(`依从性：${summary.meds.complianceRate}%`)
    }
  }

  // 副作用
  if (summary.sideEffectsTop.length > 0) {
    parts.push(`常见副作用：${summary.sideEffectsTop.join('、')}`)
  }

  // 风险提示
  if (summary.hasRisk) {
    parts.push('⚠️ 存在风险标记，请重点关注')
  }

  return parts.join('\n')
}

module.exports = {
  getValidRecords,
  normalizeRecord,
  safeNumber,
  safeAvg,
  calcMoodStats,
  calcSleepStats,
  calcMedicationStats,
  buildDoctorSummary,
  formatDoctorText
}

