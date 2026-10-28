/* eslint-disable no-unsafe-optional-chaining */
import React from 'react'
import { useLanguage } from "@/context/LanguageContext"

const Field = ({ label, children, htmlFor, error }) => {
    const { t } = useLanguage()
    const id = htmlFor || getChildId(children);
    return (
        <div className="form-control">
            {label && <label htmlFor={id} className='auth-label'>{t(label)}</label>}
            {children}
            {error &&
                <div role="alert" className="text-red-600">
                    {t(error.message)}
                </div>}
        </div>
    )
}

// get child id
const getChildId = (children) => {
    const child = React.Children.only(children);

    if ("id" in child?.props) {
        return child.props.id;
    }
};

export default Field