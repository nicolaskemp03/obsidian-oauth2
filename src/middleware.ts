import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  
  // Rutas exentas de proxy y protección
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  // Si no está logueado
  if (!isLoggedIn) {
    if (pathname === "/") {
      return NextResponse.next(); // Mostrar página de login
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Si está logueado, TODO el tráfico que no sea de la API interna
  // debe redirigirse a nuestro endpoint de proxy
  if (!pathname.startsWith("/api/proxy")) {
    const proxyUrl = new URL(`/api/proxy${pathname === '/' ? '' : pathname}`, req.url);
    proxyUrl.search = req.nextUrl.search;
    return NextResponse.rewrite(proxyUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
