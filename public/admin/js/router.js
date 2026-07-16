const AdminRouter = (function () {
    const routes = [];
    let started = false;
    let activePath = null;
    let leaveGuard = null;
    let reverting = false;

    function compile(path) {
        const paramNames = [];
        const pattern = path
            .split("/")
            .map((segment) => {
                if (segment.startsWith(":")) {
                    paramNames.push(segment.slice(1));
                    return "([^/]+)";
                }
                return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            })
            .join("/");
        return { regex: new RegExp(`^${pattern}$`), paramNames };
    }

    function on(path, handler) {
        routes.push({ path, handler, ...compile(path) });
    }

    function setLeaveGuard(fn) {
        leaveGuard = fn;
    }

    function clearLeaveGuard() {
        leaveGuard = null;
    }

    function currentPath() {
        return window.location.hash.slice(1) || "/dashboard";
    }

    function match(path) {
        for (const route of routes) {
            const found = path.match(route.regex);
            if (found) {
                const params = {};
                route.paramNames.forEach((name, index) => { params[name] = decodeURIComponent(found[index + 1]); });
                return { handler: route.handler, params };
            }
        }
        return null;
    }

    function resolve() {
        const path = currentPath();
        leaveGuard = null;
        activePath = path;
        const found = match(path);
        if (!found) {
            const notFound = match("/404");
            if (notFound) notFound.handler(path, {});
            return;
        }
        found.handler(path, found.params);
    }

    function handleHashChange() {
        if (reverting) {
            reverting = false;
            return;
        }
        if (leaveGuard && !leaveGuard()) {
            reverting = true;
            window.location.hash = activePath;
            return;
        }
        resolve();
    }

    function start() {
        if (started) {
            resolve();
            return;
        }
        started = true;
        window.addEventListener("hashchange", handleHashChange);
        resolve();
    }

    function navigate(path) {
        if (window.location.hash.slice(1) === path) {
            resolve();
            return;
        }
        if (leaveGuard && !leaveGuard()) return;
        window.location.hash = path;
    }

    return { on, start, navigate, currentPath, setLeaveGuard, clearLeaveGuard };
})();
