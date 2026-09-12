// Every screen renders inside one framed card, with the primary action pinned to its foot.
export default function Screen({ title, subtitle, children, footer, centered }) {
  return (
    <div className="page">
      <div className="app">
        {centered ? (
          children
        ) : (
          <>
            <header className="topbar">
              <h1>{title}</h1>
              {subtitle && <p className="sub">{subtitle}</p>}
            </header>
            <div className="screen-body">{children}</div>
          </>
        )}
        {footer && <div className="bottom-bar">{footer}</div>}
      </div>
    </div>
  );
}
