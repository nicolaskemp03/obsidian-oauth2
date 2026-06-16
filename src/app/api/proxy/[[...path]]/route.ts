import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// Se permite GET y POST para manejar navegación y assets
export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path);
}

async function handleProxy(req: NextRequest, pathArray?: string[]) {
  const session = await auth();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const path = pathArray ? pathArray.join("/") : "";
  const queryString = req.nextUrl.search;
  
  // URL base de Obsidian Publish. Esto debe estar en el .env
  // Por ejemplo: https://publish.obsidian.md/serve?url=mysite
  // O simplemente https://publish.obsidian.md/mysite
  const OBSIDIAN_URL = process.env.OBSIDIAN_URL || "https://publish.obsidian.md/tu-sitio";
  const targetUrl = `${OBSIDIAN_URL}/${path}${queryString}`;

  // Headers para la petición a Obsidian
  const headers = new Headers();
  
  // Obtener la cookie de sesión maestra desde .env
  // En Obsidian Publish, normalmente es un token/cookie que autoriza el acceso a sitios privados.
  const obsidianCookie = process.env.OBSIDIAN_AUTH_COOKIE;
  if (obsidianCookie) {
    headers.set("Cookie", obsidianCookie);
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      // No seguir redirecciones ciegamente si rompen el proxy
      redirect: "manual", 
    });

    // Construir la respuesta para el usuario
    const resHeaders = new Headers(response.headers);
    
    // Eliminar headers que causen problemas al re-enviar
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    return new NextResponse("Proxy Error", { status: 500 });
  }
}
