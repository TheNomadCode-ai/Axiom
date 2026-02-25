const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("axiom", {
	getSettings: () => ipcRenderer.invoke("settings:get"),
	updateSettings: (payload) => ipcRenderer.invoke("settings:update", payload),

	loadNotes: () => ipcRenderer.invoke("notes:load"),
	saveNotes: (text) => ipcRenderer.invoke("notes:save", text),

	listFiles: (scopeKey) => ipcRenderer.invoke("files:list", scopeKey),
	openFile: (scopeKey, fileName) => ipcRenderer.invoke("files:open", scopeKey, fileName),

	openExternal: (urlValue) => ipcRenderer.invoke("external:open", urlValue),
	launchVsCode: () => ipcRenderer.invoke("launch:vscode"),
	launchTerminal: () => ipcRenderer.invoke("launch:terminal"),
	launchSpotify: () => ipcRenderer.invoke("launch:spotify"),

	getMediaInfo: () => ipcRenderer.invoke("media:getInfo"),

	getLicenseStatus: () => ipcRenderer.invoke("license:getStatus"),
	activateLicense: (key, email) => ipcRenderer.invoke("license:activate", key, email),
	deactivateLicense: () => ipcRenderer.invoke("license:deactivate")
})