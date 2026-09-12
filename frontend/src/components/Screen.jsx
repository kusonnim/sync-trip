// Every screen renders inside one framed card, with its actions pinned to the foot.
// `back` puts a step-back control beside the primary button so a choice can be revised.
export default function Screen({ title, subtitle, children, footer, centered, back, className, bodyClassName }) {
  return (
    <div className="page">
      <div className={className ? `app ${className}` : 'app'}>
        {centered ? (
          children
        ) : (
          <>
            <header className="topbar">
              <h1>{title}</h1>
              {subtitle && <p className="sub">{subtitle}</p>}
            </header>
            <div className={bodyClassName ? `screen-body ${bodyClassName}` : 'screen-body'}>{children}</div>
          </>
        )}
        {(footer || back) && (
          <div className="bottom-bar">
            <div className="bottom-actions">
              {back && (
                <button
                  className="btn-back"
                  onClick={back.onClick}
                  disabled={back.disabled}
                  aria-label={`${back.label}(으)로 돌아가기`}
                >
                  ← {back.label}
                </button>
              )}
              {footer && <div className="bottom-primary">{footer}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
