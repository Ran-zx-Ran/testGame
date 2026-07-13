// 极简路由：单页面切换，每个 scene 实现 mount(container)/destroy()
export class Router {
  constructor(root, routes) {
    this.root = root;
    this.routes = routes;
    this.current = null;
    this.currentName = null;
  }

  async go(name) {
    if (this.current) {
      try { await this.current.destroy?.(); } catch (e) { console.warn(e); }
    }
    // 清空 DOM
    this.root.innerHTML = '';
    const factory = this.routes[name];
    if (!factory) throw new Error('Unknown route: ' + name);
    const scene = await factory();
    this.current = scene;
    this.currentName = name;
    await scene.mount(this.root);
  }
}
