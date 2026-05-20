const Docker = require("dockerode");

const docker = new Docker();

async function createSandbox(sessionId) {

  const container =
    await docker.createContainer({

      Image: "ubuntu:22.04",

      Tty: true,

      Cmd: ["/bin/bash"],

      OpenStdin: true,

      HostConfig: {
        Memory: 4 * 1024 * 1024 * 1024,
        NanoCPUs: 2 * 1e9,
      },
    });

  await container.start();

  return container.id;
}

module.exports = {
  createSandbox,
};
