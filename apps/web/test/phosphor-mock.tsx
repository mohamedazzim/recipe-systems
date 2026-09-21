// Unit-test stand-in for @phosphor-icons/react: each icon renders a span with
// the icon name so queries stay stable and tests never depend on the real ESM
// package (which jest cannot transform without extra config).
import React from 'react';

export function iconStub(name: string) {
  return function IconStub({ size, weight, className, 'aria-hidden': ariaHidden }: {
    size?: number | string;
    weight?: string;
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }) {
    return (
      <span data-icon={name} data-size={size} data-weight={weight} aria-hidden={ariaHidden} className={className} />
    );
  };
}

export const ArrowLeft = iconStub('ArrowLeft');
export const ArrowRight = iconStub('ArrowRight');
export const Basket = iconStub('Basket');
export const Books = iconStub('Books');
export const Camera = iconStub('Camera');
export const CaretDown = iconStub('CaretDown');
export const CaretLeft = iconStub('CaretLeft');
export const CaretRight = iconStub('CaretRight');
export const ChartBar = iconStub('ChartBar');
export const Check = iconStub('Check');
export const CheckCircle = iconStub('CheckCircle');
export const Clock = iconStub('Clock');
export const CookingPot = iconStub('CookingPot');
export const DotsThreeVertical = iconStub('DotsThreeVertical');
export const FileText = iconStub('FileText');
export const Files = iconStub('Files');
export const Flask = iconStub('Flask');
export const ForkKnife = iconStub('ForkKnife');
export const House = iconStub('House');
export const Lightbulb = iconStub('Lightbulb');
export const ListBullets = iconStub('ListBullets');
export const ListChecks = iconStub('ListChecks');
export const ListNumbers = iconStub('ListNumbers');
export const MagnifyingGlass = iconStub('MagnifyingGlass');
export const Moon = iconStub('Moon');
export const PencilSimple = iconStub('PencilSimple');
export const Plant = iconStub('Plant');
export const Plus = iconStub('Plus');
export const Scissors = iconStub('Scissors');
export const SignOut = iconStub('SignOut');
export const Sun = iconStub('Sun');
export const Tag = iconStub('Tag');
export const Trash = iconStub('Trash');
export const UploadSimple = iconStub('UploadSimple');
export const UserCirclePlus = iconStub('UserCirclePlus');
export const Warning = iconStub('Warning');
export const X = iconStub('X');
export const XCircle = iconStub('XCircle');
