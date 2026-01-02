const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("daily_records");
    const wxContext = cloud.getWXContext();
    const now = Date.now();
    // 注意：示例数据需要包含 _openid，否则在启用安全规则后会失败
    await db.collection("daily_records").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
        _openid: wxContext.OPENID,
        createdAt: now,
        updatedAt: now,
      },
    });
    await db.collection("daily_records").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
        _openid: wxContext.OPENID,
        createdAt: now,
        updatedAt: now,
      },
    });
    await db.collection("daily_records").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
        _openid: wxContext.OPENID,
        createdAt: now,
        updatedAt: now,
      },
    });
    await db.collection("daily_records").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
        _openid: wxContext.OPENID,
        createdAt: now,
        updatedAt: now,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  const wxContext = cloud.getWXContext();
  return await db.collection("daily_records")
    .where({
      _openid: wxContext.OPENID
    })
    .orderBy('createdAt', 'desc')
    .get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const now = Date.now();
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("daily_records")
        .where({
          _id: event.data[i]._id,
          _openid: wxContext.OPENID
        })
        .update({
          data: {
            sales: event.data[i].sales,
            updatedAt: now,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const insertRecord = event.data;
    const now = Date.now();
    // 插入数据
    await db.collection("daily_records").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
        _openid: wxContext.OPENID,
        createdAt: now,
        updatedAt: now,
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    await db
      .collection("daily_records")
      .where({
        _id: event.data._id,
        _openid: wxContext.OPENID
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const sumRecord = require('./sumRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
  }
};
