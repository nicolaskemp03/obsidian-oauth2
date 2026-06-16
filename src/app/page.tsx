import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '400px', width: '100%', padding: '40px', textAlign: 'center' }}>

        <div style={{ marginBottom: '30px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 'bold', color: 'var(--konexa-green)' }}>
            /&lt;<span style={{ color: 'var(--text-main)' }}>onexa</span>_ <span style={{ color: 'var(--konexa-blue)' }}>*</span>
          </div>
          <h2 style={{ fontSize: '1.2rem', marginTop: '10px', color: 'var(--text-muted)' }}>Docs Proxy</h2>
        </div>

        <p style={{ marginBottom: '30px', fontSize: '0.95rem', color: 'var(--text-muted)' }}>
          Para acceder a la documentación de Konexa, por favor inicia sesión con tu cuenta corporativa.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("azure-ad", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn-microsoft" style={{ width: '100%' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
            </svg>
            Ingresar con Microsoft
          </button>
        </form>

        <div style={{ marginTop: '40px', fontSize: '0.8rem', color: 'var(--text-muted)' }} style={{ fontFamily: 'var(--font-mono)' }}>
          Somos talento TI_
        </div>
      </div>
    </div>
  );
}
