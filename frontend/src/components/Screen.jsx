export default function Screen({ step, title, subtitle, children, footer }) {
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        {step && <span className="step-badge">STEP {step}</span>}
      </header>
      {children}
      {footer && <div className="bottom-bar">{footer}</div>}
    </div>
  );
}
