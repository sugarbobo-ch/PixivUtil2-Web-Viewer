import React from 'react';
import { Button, ButtonProps } from './Button';

export interface SidebarSectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  titleButtonProps?: Omit<ButtonProps, 'children'>;
  className?: string;
}

const joinClassNames = (...classNames: Array<string | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

export const SidebarSectionHeader: React.FC<SidebarSectionHeaderProps> = ({
  icon,
  title,
  count,
  actions,
  titleButtonProps,
  className,
}) => {
  const titleContent = (
    <>
      {icon}
      <span className="app-sidebar__section-header-title-text">{title}</span>
      {count !== undefined && (
        <span className="app-sidebar__section-header-count">{count}</span>
      )}
    </>
  );

  const titleControl = titleButtonProps ? (() => {
    const { className: titleButtonClassName, ...buttonProps } = titleButtonProps;
    return (
      <Button
        {...buttonProps}
        className={joinClassNames(
          'app-sidebar__section-header-title-control',
          titleButtonClassName,
        )}
      >
        {titleContent}
      </Button>
    );
  })() : (
    <div className="app-sidebar__section-header-title">
      {titleContent}
    </div>
  );

  return (
    <div className={joinClassNames('app-sidebar__section-header', className)}>
      {titleControl}
      {actions && (
        <div className="app-sidebar__section-header-actions app-sidebar__section-heading-actions">
          {actions}
        </div>
      )}
    </div>
  );
};
