import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Konexa Docs",
  description: "Acceso seguro a la documentación de Konexa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
