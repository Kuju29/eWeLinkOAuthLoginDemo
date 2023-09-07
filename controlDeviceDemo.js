import { client } from "./config.js";
import cronParser from "cron-parser";
import dns from "dns";
import * as fs from "fs";

const turn_on = true;
const turn_off = false;

const controlDeviceDemo = async () => {
  // If the file does not exist, directly report an error
  if (!fs.existsSync("./token.json")) {
    throw new Error("token.json not found, please run login.js first");
  }

  // get token
  let LoggedInfo = JSON.parse(fs.readFileSync("./token.json", "utf-8"));
  // console.info(LoggedInfo)
  client.at = LoggedInfo.data?.accessToken;
  client.region = LoggedInfo?.region || "as";
  client.setUrl(LoggedInfo?.region || "as");
  // Check if the token has expired, and refresh the token if it has expired
  if (
    LoggedInfo.data?.atExpiredTime < Date.now() &&
    LoggedInfo.data?.rtExpiredTime > Date.now()
  ) {
    console.log("Token expired, refreshing token");
    const refreshStatus = await client.user.refreshToken({
      rt: LoggedInfo.data?.refreshToken,
    });
    console.log(refreshStatus);
    if (refreshStatus.error === 0) {
      // You can also use built-in storage
      // client.storage.set('token', {...})
      fs.writeFileSync(
        "./token.json",
        JSON.stringify({
          status: 200,
          responseTime: 0,
          error: 0,
          msg: "",
          data: {
            accessToken: refreshStatus?.data?.at,
            atExpiredTime: Date.now() + 2592000000,
            refreshToken: refreshStatus?.data?.rt,
            rtExpiredTime: Date.now() + 5184000000,
          },
          region: client.region,
        })
      );
      LoggedInfo = JSON.parse(fs.readFileSync("./token.json", "utf-8"));
    }
  }

  if (LoggedInfo.data?.rtExpiredTime < Date.now()) {
    console.log(
      "Failed to refresh token, need to log in again to obtain token"
    );
    return;
  }

  try {
    await checkAndUpdate(client);
    setInterval(() => checkAndUpdate(client), 5 * 60 * 1000);
  } catch (e) {
    console.log(e);
  }
};

const checkAndUpdate = async (client) => {
  console.log(`Updated at ${new Date().toLocaleString()}`);
  dns.lookup("google.com", async (err) => {
    if (err && err.code === "ENOTFOUND") {
      console.error("No internet connection");
    } else {
      const thingList = await client.device.getAllThingsAllPages();
      const devices = thingList.data.thingList;
      if (!Array.isArray(devices)) {
        console.error("Error: thingList is not an array", devices);
        return;
      }
      let now = new Date();

      for (const device of devices) {
        if (device.itemData.online) {
          const deviceParams = device.itemData.params;
          const deviceswitches = deviceParams.switches;
          const status = deviceswitches.find((item) => item.outlet === 0);

          if (deviceParams.timers && deviceParams.timers.length >= 2) {
            const cronTimer1 = deviceParams.timers[0].at;
            const cronTimer2 = deviceParams.timers[1].at;

            const cronExpression1 = cronParser.parseExpression(cronTimer1);
            const cronExpression2 = cronParser.parseExpression(cronTimer2);

            let newTime1 = cronExpression1.next().toDate();
            let newTime2 = cronExpression2.next().toDate();
            newTime1.setUTCHours(newTime1.getUTCHours() + 7);
            newTime2.setUTCHours(newTime2.getUTCHours() + 7);

            let nowInSeconds =
              now.getUTCHours() * 3600 +
              now.getUTCMinutes() * 60 +
              now.getUTCSeconds();
            let onTimeInSeconds =
              newTime1.getUTCHours() * 3600 +
              newTime1.getUTCMinutes() * 60 +
              newTime1.getUTCSeconds();
            let offTimeInSeconds =
              newTime2.getUTCHours() * 3600 +
              newTime2.getUTCMinutes() * 60 +
              newTime2.getUTCSeconds();

            let [onDate, offDate] = [offTimeInSeconds, onTimeInSeconds].sort(
              (a, b) => a - b
            );

            if (nowInSeconds >= onDate && nowInSeconds <= offDate) {
              if (status.switch == "off") {
                if (turn_on) {
                  await client.device.setThingStatus({
                    type: 1,
                    id: device.itemData.deviceid,
                    params: {
                      switches: [{ switch: "on", outlet: 0 }],
                    },
                  });
                  console.log(
                    `Device: ${device.itemData.name} เปลี่ยนเป็น ${status.switch} เพราะไม่ตรงตามเวลาปัจจุบัน.`
                  );
                } else {
                  console.log(
                    `Device: ${device.itemData.name} ไม่สามารถเปลี่ยนสถานะได้ เนื่องจากปิดการใช้งานฟังชั่นอยู่`
                  );
                }
              } else {
                console.log(
                  `Device: ${device.itemData.name} สถานะ ${status.switch} ในตารางเวลา ปกติ`
                );
              }
            } else {
              if (status.switch == "on") {
                if (turn_off) {
                  await client.device.setThingStatus({
                    type: 1,
                    id: device.itemData.deviceid,
                    params: {
                      switches: [{ switch: "off", outlet: 0 }],
                    },
                  });
                  console.log(
                    `Device: ${device.itemData.name} เปลี่ยนเป็น ${status.switch} เพราะไม่ตรงตามเวลาปัจจุบัน.`
                  );
                } else {
                  console.log(
                    `Device: ${device.itemData.name} ไม่สามารถเปลี่ยนสถานะได้ เนื่องจากปิดการใช้งานฟังชั่นอยู่`
                  );
                }
              } else {
                console.log(
                  `Device: ${device.itemData.name} สถานะ ${status.switch} นอกตารางเวลา ปกติ `
                );
              }
            }
          } else {
            // console.log(`Device: ${device.name} ไม่ได้ตั้งเวลาเปิดปิด`);
          }
        } else {
          console.log(`Device: ${device.name} is offline.`);
        }
      }
    }
  });
};

controlDeviceDemo();
