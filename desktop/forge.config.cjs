module.exports = {
  packagerConfig: {
    asar: true,
    icon: "assets/icon",
    extraResource: ["assets/icon.png"],
    executableName: "reason",
    name: "reason",
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
    },
  ],
}
